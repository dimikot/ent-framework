# To JOIN or not to JOIN

Ent Framework design discourages people to use SQL JOINs. Instead, it relies on the in-app parallel Promises merging and query batching & coescing, for 2 main reasons:

1. It allows to work with microshards seamlessly (no JOINs can be run across the database boundaries efficiently).
2. It holistically solves [N+1 Selects problem](../getting-started/n+1-selects-solution.md).

## Types of Joins

In web development, JOINs are generally abused heavily. There are 3 main usecases when people use JOINs traditionaly, and only 2 of them are legit.

### Statistical Queries and OLAP

When you have a large database, you sometimes need to pull some statistical information out of it. E.g. to answer a question, how many users registered and performed some action within a time frame, or how much money did the service earen, etc. Often times, building an SQL query with JOINs and running it over a replica database is the easiest solution.

This use case is not so much frequent though. And although it's a fully legit use for the JOINs, it is relatively rare. Also, the larger your service becomes, the higher are the chances that you'll need to use some data warehouse solution (like n or a Presto-backed service) for offline analysis.

What distinguishes such a use case that you run a small number of very heavy queries (OLAP pattern).

### Precise Query Optimization

Sometimes you just want to squeeze the maximum performance from your database when running an OLTP load (i.e. when running a large number of very fast queries). I.e. you use JOINs for computational performance reasons: instead of transmitting 2 large lists from the database and intersecting them at the client (throwing away the absolute most of the transferred rows), you ask the database server to do it internally utilizing indexes.

But again, although it's a fully legit use case for JOINs, the need for it is relatively rare.

### Parent-Children Relationships Loading and N+1 Selects Problem

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

Such an API has 2 fundamental flaws:

1. If you need to load 100 comment — what would you even do? Try using `Promise.all()` with `loadCommentWithDetails()` for 100 IDs, an you'll get 100 database queries with JOINs.
2. "Load comments with details" — with what exact details? In one place of the code you'll need authors and topics, and in another one, you may only need the direct comment creator. Would you create a separate function with boilerplate for that?

