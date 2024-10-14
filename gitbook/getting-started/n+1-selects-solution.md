# N+1 Selects Solution

To reveal some magic, could you please make a small favor?

**Stop thinking in terms of lists when loading.** Always think in terms of an individual row/object and an individual ID. Not in terms of an array of IDs:

```typescript
async function loadCommentsBadDontDoThis(ids: string[]): Promise<Comment[]> {
  // Please don't.
}

async function loadComment(id: string): Promise<Comment> {
  // To this: one ID as an input, one row as an output.
}  
```

It sounds contradictory. In the example above, if we always use `loadComment(id)`, how do we avoid sending too many queries to the database, especially when it comes to loading children records for each loaded parent? (This problem is well known as "N+1 Selects".)

The answer is: **let the DB access engine take care of batching**.

## Traditional List Based Approach

Imagine we have some list of comment IDs shown on the screen. For each comment, we want to load its creator, the owning topic, and for each topic, load its creator too. Then, return it all as a JSON to the client.

Of course we want to send as few SQL queries to the database as possible to minimize connections utilization and round-trip latency. We also do not want to use JOINs (imagine `loadUsers()`, `loadTopics()` and `loadComments()` live in independent modules and don't want to know about each other).

First, let's see, what will happen if we think in terms of "load a list of things" abstraction. This is how people used to fight the "N+1 Selects" problem in the past.

```typescript
import { map, uniq, keyBy } from "lodash";

async function loadUsers(ids: string): Promise<User[]> {
  return sql.query("SELECT * FROM users WHERE id = ANY($1)", ids);
}

async function loadTopics(ids: string): Promise<Topic[]> {
  return sql.query("SELECT * FROM topics WHERE id = ANY($1)", ids);
}

async function loadComments(ids: string[]): Promise<Comment[]> {
  return sql.query("SELECT * FROM comments WHERE id = ANY($1)", ids);
}

// Loads data using just 3 SQL queries.
app.get("/comments", async (req, res) => {
  const commentIDs = String(req.query.ids).split(",");
  const comments = keyBy(await loadComments(commentIDs), "id");

  const topicIDs = uniq(map(comments, (comment) => comment.topic_id));
  const topics = keyBy(await loadTopics(topicIDs), "id");

  const userIDs = uniq([
    ...map(comments, (comment) => comment.creator_id),
    ...map(topics, (topic) => topic.creator_id),
  ]);
  const users = keyBy(await loadUsers(userIDs), "id");

  res.json(
    map(comments, (comment) => ({
      comment,
      commentCreator: users[comment.creator_id],
      topic: topics[comment.topic_id],
      topicCreator: users[topics[comment.topic_id].creator_id],
    }))
  );
});
```

Look at this spaghetti mess. The code appears very coupled.

The root of the problem here is clear: we think in terms of the lists, and the code encourages us to "accumulate" lists manually.

## Ent Framework Approach: Automatic Batching

Now let's see what happens if we stop thinking in terms of lists and, instead, switch to "per individual object" paradigm.

```typescript
// Still data using just 3 SQL queries. But wait a second...
app.get("/comments", async (req, res) => {
  const commentIDs = uniq(String(req.query.ids).split(","));
  res.json(
    await Promise.all(
      commentIDs.map(async (commentID) => {
        const comment = await EntComment.loadX(req.vc, commentID);
        const topic = await EntTopic.loadX(req.vc, comment.topic_id);
        const [commentCreator, topicCreator] = await Promise.all([
          EntUser.loadX(req.vc, comment.creator_id),
          EntUser.loadX(req.vc, topic.creator_id),
        ]);
        return { comment, commentCreator, topic, topicCreator };
      })
    )
  );
});

```

All calls to `uniq()`, `keyBy()` and `map()` are gone. We now use only `loadX(vc, id)` which accepts an individual ID and returns an individual Ent.

And still, it runs only 3 SQL queries under the hood:

```sql
SELECT * FROM comments WHERE id IN(...);
SELECT * FROM topics WHERE id IN(...);
SELECT * FROM users WHERE id IN(...);
```

* **Batching:** Ent Framework recognizes that the `loadX()` calls happen in concurrent Promises and batches them together intelligently.
* **Coalescing:** in case multiple `loadX(vc, id)` try to load the same Ent by the same ID, Ent Framework coalesces those calls into one.
* **Caching:** if enabled, an Ent loaded in some VC remains in the VC's cache, so next time it's attempted to load again, the Ent is returned from the cache directly. Ents are immutable JS objects, so it simplifies things even further.

{% hint style="info" %}
In fact, Ent Framework does similar batching not only for loadX(). It batches all other calls too, including inserts, updates, deletes and even more complicated expression-based multi-row selects.
{% endhint %}

## Helper Loading Methods

Each Ent is an immutable object, which means that you can't change its fields after loading from the DB. But you can add helper methods to simplify things like loading.

Let's simplify the above example even further by adding `topic()` and `creator()` helper methods into Ent classes directly.

```typescript
class EntComment extends ... {
  async topic() {
    return EntTopic.loadX(this.vc, this.topic_id);
  }

  async creator() {
    return EntUser.loadX(this.vc, this.creator_id);
  }
}

class EntTopic extends ... {
  async creator() {
    return EntUser.loadX(this.vc, this.creator_id);
  }
}

app.get("/comments", async (req, res) => {
  const commentIDs = String(req.query.ids).split(",");
  res.json(
    await mapJoin(commentIDs, async (commentID) => {
      const comment = await EntComment.loadX(req.vc, commentID);
      const topic = await comment.topic();
      const [commentCreator, topicCreator] = await Promise.all([
        comment.creator(),
        topic.creator(),
      ]);
      return { comment, commentCreator, topic, topicCreator };
    })
  );
});
```

{% hint style="info" %}
`mapJoin(arr, fn)` is a simple wrapper which calls `Promise.all(arr.map(fn))`.
{% endhint %}

Now it's responsibility of each Ent to load the related data.

This will, as previously, produce the same exact 3 DB queries:

```sql
SELECT * FROM comments WHERE id IN(...);
SELECT * FROM topics WHERE id IN(...);
SELECT * FROM users WHERE id IN(...);
```

In traditional ORMs, such helper loading methods are added to the classes automatically. Ent Framework doesn't do it and requires you to write a bit of boilerplate. Why? For general purpose use cases, we may need not one, but 2 method for each field, like `creator()` and `creatorNullable()`, which is not elegant. This is because foreign keys do not work reliably enough across microshards, so in some cases, we should always be ready that some Ent is not in the database, even when its field is technically non-nullable. Luckily, in practice, it is not hard at all to add such methods manually, so we don't lose too much here.

## Batching vs. JOINs

In traditional SQL and in many ORMs, people use JOINs to minimize the number of queries they send to the database engine. Despite JOINs have advantages, they are also problematic:

1. One cannot do JOINs across microshards or machines.
2. JOINs encourage people to write highly coupled code, similar to the 1st example on this page.
3. JOINs generally can't run their subqueries in parallel.

Ent Framework's automatic batching can be treated as an alternative to JOINs. It doesn't have any of the above problems, plus (and more importantly), the calls are batched across the entire async functions call stack, which means that you can split the code into independent abstraction layers easily.

Stop thinking in terms of lists. Start thinking in terms of an individual Ent and its behavior.

{% hint style="info" %}
Of course, in some cases, we still want to run JOINs. Ent Framework exposes low-level API to get access to the underlying DB, so you can craft and run arbitrary queries. It also provides you with a `Loader` abstraction and framework to build your own custom batching strategies. We'll discuss it all in details in the advanced section.
{% endhint %}

