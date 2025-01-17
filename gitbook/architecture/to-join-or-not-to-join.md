# To JOIN or not to JOIN

Ent Framework design discourages people to use SQL JOINs. Instead, it relies on the in-app parallel Promises merging and query batching & coescing, for 2 main reasons:

1. It allows to work with microshards seamlessly (no JOINs can be run across the database boundaries efficiently).
2. It holistically solves [N+1 Selects problem](../getting-started/n+1-selects-solution.md).

## Types of Joins

In web development, JOINs are generally abused heavily. There are 3 main usecases when people use JOINs traditionaly, and only 2 of them are legit.

### Type 1: Statistical Queries and OLAP

When you have a large database, you sometimes need to pull some statistical information out of it. E.g. to answer a question, how many users registered and performed some action within a time frame, or how much money did the service earen, etc. Often times, building an SQL query with JOINs and running it over a replica database is the easiest solution.

This use case is not so much frequent though. And although it's a fully legit use for the JOINs, it is relatively rare. Also, the larger your service becomes, the higher are the chances that you'll need to use some data warehouse solution (like n or a Presto-backed service) for offline analysis.

What distinguishes such a use case that you run a small number of very heavy queries (OLAP pattern).

### Type 2: Precise Query Optimization

Sometimes you just want to squeeze the maximum performance from your database when running an OLTP load (i.e. when running a large number of very fast queries). I.e. you use JOINs for computational performance reasons: instead of transmitting 2 large lists from the database and intersecting them at the client (throwing away the absolute most of the transferred rows), you ask the database server to do it internally utilizing indexes.

But again, although it's a fully legit use case for JOINs, the need for it is relatively rare.

### Type 3: Parent-Children Loading and N+1 Selects Problem

And here coms the most frequent use cases when JOINs are used (actually, abused) in all mainstream ORMs. It is not related to slow queries, and not related to intersecting large lists throwing away non-matching items. The use case is purely about loading some objects and then their parents (or children), i.e. loading a data from a graph-like structure.

In fact, such use case composes the absolute most of the queries in real life.

Let's see how it's done in Prisma:

```typescript
const commentsWithDetails = await prisma.comment.findMany({
  where: {
    id: {
      in: commentIds,
    },
  },
  include: {
    author: true, // Include the author of the comment.
    topic: {
      include: {
        creator: true, // Include the creator of the topic.
      },
    },
  },
});
```

This query produces a JOIN, and it does it for only one sole purpose: to work-around the [N+1 Selects](../getting-started/n+1-selects-solution.md) problem.

Why is it bad? Because such approaches forces us to maka an assumprion that at this level of abstraction, we have the complete list of comment IDs, and it is almost always not the case.

Consider that we only know one comment ID at a time, but still want to pull the objects related to that comment:

```typescript
async function loadCommentWithDetails(id: string) {
  return prisma.comment.findUnique({
    where: {
      id
    },
    include: {
      author: true, // Include the author of the comment.
      topic: {
        include: {
          creator: true, // Include the creator of the topic.
        },
      },
    },
  });
}
```

Such an API has 2 fundamental flaws when using traditional ORMs without query built-in query batching:

1. If you need to load 100 comment — what would you even do? Try using `Promise.all()` with `loadCommentWithDetails()` for 100 IDs, an you'll get 100 database queries with JOINs.
2. "Load comments with details" — with what exact details? In one place of the code you'll need authors and topics, and in another one, you may only need the direct comment creator. Would you create a separate function with boilerplate for that?

## Painful Boilerplate Analogy

That type 3 of JOINs above is not quite what JOINs are designed for: people use it to "duct tape" the real problem in a boilerplatish way. This reminds the early days of Web, when people were emitting their HTML as plain text, escaping values in every place:

```html
<-- PHP code from 1990x, beware: your eyes will bleed! -->
<p>Hellow, <?php echo htmlspecialchars($first); ?>
<?php echo htmlspecialchars($last); ?>!</p>
```

Thousands of projects were written this way, and they are still there. Type 3 of JOINs is not much different conceptually.

Also, think about the data duplication such JOINs produce over the wire. Consider the following query:

```sql
SELECT
  comments.id,
  comments.text,
  users.id AS author_id,
  users.name AS author_name
FROM comments
JOIN users ON users.id = comments.author_id
```

and the resulting data which is sent from the database server:

| id | text    | author\_id | author\_name |
| -- | ------- | ---------- | ------------ |
| 1  | hello   | 42         | Alice        |
| 2  | my      | 42         | Alice        |
| 3  | dear    | 42         | Alice        |
| 4  | friend  | 101        | Bob          |
| 5  | bye now | 101        | Bon          |

Does it hurt your sense of engineering perfection? Does it smell to you?

1. The author\_id+author\_name pair of values is repeated 3 times in the payload for the first 3 comments, and then repeated 2 times for the last 2 comments. Imagine now that `users` table has way more columns.
2. Another smell is that "author\_" prefix: although being minor, it's clearly a naming boilerplate. You need to introduce some naming mapping convention between the column names in the JOIN result and in your ORM objects (be it glueing parts with "\_" or with "." or whatever).

Such things are more related not to real resources utilization (the difference is marginal), but to the design and architecture smells.

## Round Trip Latency Consideration

To be fair, there is still one benefit in using type 3 JOINs: when you fetch comments, topics and users all at once, you only have 1 round-trip to the database server:

```sql
-- Traditional ORM's way: 1 round-trip.
SELECT *
FROM comments
JOIN topics ON topics.id = comments.topic_id
JOIN users authors ON authors.id = comments.author_id
JOIN users creators ON creators.id = topics.creator_id
```

I.e. you send 1 request and get 1 response (with duplicated data, but anyways).

If your backend-to-database network connection is slow (like one query takes 50 ms, which happens in commerical and highly vendor-lock-in prone solutions like Vercel and other players promote), then such consideration is significant.

So, in slow networks, JOINs win over the Ent Framework's automatic batching approach:

```sql
-- Ent Framework's way: 3 round-trips.
SELECT * FROM comments WHERE id IN(...);
SELECT * FROM topics WHERE id IN(...);
SELECT * FROM users WHERE id IN(...);
```

What's the catch? The fact is that in real life (and since 1990x), your network to the database is **not** slow. Quite the opposite, it is very fast, and you have sub-millisecond latency. Otherwise your entire backend becomes just so painfully slow in all other places that you can't manage it.

Databases are designed to serve queries, do it fast, and with low latency at high concurrency. This is what the databases are for. Let's use the microscope for science and not to hammer nails.

* False assumption: 50 ms database query is a norm; JOINs are to minimize round trips and solve [N+1 Selects](../getting-started/n+1-selects-solution.md) problem; take my money dear Vercel & Co.
* Reality: you have troubles with your app design if the query latency is longer than 1-2 ms; round trip time does not affect latency much in case the queries are batched.

