# Atomic Updates and CAS

Ent Framework does not expose transactions in its top-level APIs: it's a trade-off made towards supporting automatic queries batching and built-in microsharding. Of course, each individual write to the database is still transactional, but you can't have a notion of "all or nothing" when updating multiple Ents. (Those Ents may also reside in different microshards, so a robust transactional update for them is impossible even in theory.)

Except when you build a billing solution or a banking app, transactions are rarely needed in practice: probably in less than 1% of cases. Occasionally, you may want to transactionally update multiple Ents still, or (more often) update a single Ent in "read-modify-write" fashion, when it's guaranteed that there are no concurrent writes happened in between. To do this, you have the following options:

1. Use [PgClient's low level API](../scalability/sharding-low-level-api.md), `acquireConn()` and `release()`. It exposes the vanilla [node-postgres](https://www.npmjs.com/package/pg) client object, which you can use directly: run transactions, streaming operations etc. You'll have to write raw SQL in this case though.
2. Incapsulate your multi-table update logic in a PostgreSQL stored procedure or in a [PostgreSQL trigger](https://www.postgresql.org/docs/17/sql-createtrigger.html). (In fact, out of the 1% mentioned above, probably 80% can be covered with a native PostgreSQL trigger.) Ent Framework is very friendly to allowing the developer use built-in underlying database's features. The main idea is that both stored functions and triggers are atomic in PostgreSQL, so if you call them, you'll get the transactional behavior without using `BEGIN...COMMIT` statements. Of course, it's possible only for Ents living in the same microshard.
3. For "read-modify-write" cases, use Ent Framework's `$cas` feature which is described below.

The truth is that, even without full `BEGIN...COMMIT` transactions, it's surprising how far can you go with just having a CAS primitive. (People typically tend to over-use classical transactions.)

### Compare And Swap ($cas) in update\*() Calls

{% hint style="info" %}
Strictly speaking, this feature is not a classical "compare and swap": there is no "swap" step, it's more like a "conditional assignment" or "compare and update" pattern. But in the industry, the group of algorithms like that are typically named CAS, so we name it the same way in Ent Framework.
{% endhint %}

Let's start with a classical read-modify-write code example:

```typescript
while (true) {
  const topic = await EntTopic.loadX(vc, topicID);
  const newTags = uniq([...topic.tags, "my-tag"]);
  const didUpdate = await topic.updateOriginal({
    tags: newTags,
    $cas: { tags: topic.tags },
  });
  if (didUpdate) {
    break;
  }
}
```

Here, we want to append a tag to EntTopic, but we want to be protected against concurrent overwrites: if someone else is adding another tag to the same topic right now, in between our own read and write, we don't want to lose that update.

Here, `$cas` allows us to perform the update only if the values passed to its properties have not changed **in the database** since our earlier read. If they did in fact change, then we do an in-app retry of the read-modify-write sequence.

### Short Syntax: Pass Only Field Names

The pattern above is so common that the code can be shortened:

```typescript
const didUpdate = await topic.updateOriginal({
  tags: newTags,
  $cas: ["tags"], // same as $cas: { tags: topic.tags }
});
```

Here, we tell Ent Framework that it should grab the "original" values for the `$cas` fields from the Ent's properties: in this case, from `topic.tags`.

### Short Syntax: All Updating Fields

The practice shows that in the absolute most of the cases, you are updating exactly the same set of fields that you want to protect with `$cas`. It is not mandatory (e.g. you may `$cas` on a timestamp or version field and update way more than that), but often, it's what you want.

There is a "shorter" syntax for this:

```typescript
const didUpdate = await topic.updateOriginal({
  tags: newTags,
  $cas: "skip-if-someone-else-changed-updating-ent-props",
});
```

Don't worry that `skip-if-someone-else-changed-updating-ent-props` is so intentionally long: it's type-safe (enforced by TypeScript). It is so long just to be explicitly-descriptive.

### Don't Mix Up $cas and updateChanged()!

In [ent-api-update.md](../getting-started/ent-api-update.md "mention") article we mentioned another call, `updateChanged()`:

```typescript
const result = topic.updateChanged({
  title: newTitle,
});
```

Be aware that its behavior is very different from what `$cas` feature provides: it does not guarantee read-after-write consistency, it just compares the updating fields with the original values in the Ent (not in the database)! The catch is that in the Ent, the field values may be outdated in comparison what's stored in the database right now.

Let's compare those 2 calls side by side.

Without `$cas`:

```typescript
const result = topic.updateChanged({
  tags: newTags,
});
```

1. Cancels the update in case `newTags === topic.tags` in memory (i.e. may send 0 or 1 SQL query to the database).
2. Does not protect from concurrent changes made by some other Node process in the cluster.
3. After the update, `result` is either an array of actually updated field names (truthy value), `null` if the update got cancelled (no changed fields), or `false` if there is no such Ent in the database anymore.

And with `$cas`:

```typescript
const result = topic.updateOriginal({
  tags: newTags,
  $cas: "skip-if-someone-else-changed-updating-ent-props", // <-- added $cas
});
```

1. Always sends 1 UPDATE query to the master node, since `$cas` checks the condition on the destination database, not in memory. This means that it almost always doesn't matter, whether the Ent was initially loaded from master or from a replica: in both cases, `$cas` will protect against any improper change.
2. Protects againt concurrent changes made by some other Node process in the cluster.
3. Returns `true` if the update succeeded and `false` in case `$cas` comparison failed or there was no Ent in the database (it's easy to see that both variants can be considered as CAS expectation failures).

Notice that `updateChanged()` can also work with `$cas`:

```typescript
const result = topic.updateChanged({
  tags: newTags,
  $cas: "skip-if-someone-else-changed-updating-ent-props", // <-- added $cas
});
```

It will give you the mix of both worlds: cancelling the query in case `newTags` is unchanged in comparison to `topic.tags` (which is more a syntax sugar in your code), plus protecting against the concurrent changes.

## Using $literal in updateOriginal() Call

There is another way of doing a conflict-free update (like appending to an array field) in Ent Framework:

```typescript
await topic.updateOriginal(vc, {
  $literal: [
    "tags = ARRAY(SELECT DISTINCT unnest FROM unnest(array_append(tags, ?)))",
    "my-tag",
  ]
});
```

Here, we use `$literal` feature that enables you to pass a raw SQL expression, so the query will look like:

```sql
UPDATE topics
SET tags = ARRAY(SELECT DISTINCT unnest FROM unnest(array_append(tags, 'my-tag')))
WHERE id = 1004200047373526525
```

There are several downsides in this approach though:

1. Calls of this kind can't be batched, so if you run multiple of them in parallel, Ent Framework will send independent queries.
2. It is engine-specific and uses PostgreSQL stored functions under the hood.
