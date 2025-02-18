# Atomic Updates and CAS

Ent Framework does not expose transactions in its top-level APIs: it's a trade-off made towards supporting automatic queries batching and built-in microsharding. Of course, each individual write to the database is still transactional, but you can't have a notion of "all or nothing" when updating multiple Ents. (Those Ents may also reside in different microshards, so a robust transactional update for them is impossible even in theory.)

Except when you build a billing solution or a banking app, transactions are rarely needed in practice: probably in less than 1% of cases. Occasionally, you may want to transactionally update multiple Ents still, or (more often) update a single Ent in "read-modify-write" fashion, when it's guaranteed that there are no concurrent writes happened in between. To do this, you have the following options:

1. Use [PgClient's low level API](../scalability/sharding-low-level-api.md), `acquireConn()` and `release()`. It exposes the vanilla [node-postgres](https://www.npmjs.com/package/pg) client object, which you can use directly: run transactions, streaming operations etc. You'll have to write raw SQL in this case though.
2. Incapsulate your multi-table update logic in a PostgreSQL stored procedure or in a [PostgreSQL trigger](https://www.postgresql.org/docs/17/sql-createtrigger.html). (In fact, out of the 1% mentioned above, probably 80% can be covered with a native PostgreSQL trigger.) Ent Framework is very friendly to allowing the developer use built-in underlying database's features. The main idea is that both stored functions and triggers are atomic in PostgreSQL, so if you call them, you'll get the transactional behavior without using `BEGIN...COMMIT` statements. Of course, it's possible only for Ents living in the same microshard.
3. For "read-modify-write" cases, use Ent Framework's `$cas` feature which is described below.

### Compare And Swap ($cas) in update\*() Calls

{% hint style="info" %}
Strictly speaking, this feature is not a classical "compare and swap": there is no "swap" step, it's more like a "conditional assignment" or "compare and update" pattern. But in the industry, the group of algorithms like that are typically named CAS, so we name it the same way in Ent Framework.
{% endhint %}

Let's start with a classical read-modify-write code example:

```typescript
while (true) {
  const topic = await EntTopic.loadX(vc, topicID);
  const newTags = uniq([...topic.tags, "my-tag"]);
  const updated = await topic.updateOriginal({
    tags: newTags,
    $cas: { tags: topic.tags },
  });
  if (updated) {
    break;
  }
}
```

Here, we want to append a tag to EntTopic, but we want to be protected against concurrent overwrites: if someone else is adding another tag to the same topic right now, in between our own read and write, we don't want to lose that update.

Here, `$cas` allows us to perform the update only if the values passed to its properties have not changed since our earlier read. If they did in fact change, then we do an in-app retry of the read-modify-write sequence.

### Short Syntax: Pass Only Field Names

The pattern above is so common that the code can be shortened:

```typescript
const updated = await topic.updateOriginal({
  tags: newTags,
  $cas: ["tags"], // same as $cas: { tags: topic.tags }
});
```

Here, we tell Ent Framework that it should grab the "original" values for the `$cas` fields from the Ent's properties: in this case, from `topic.tags`.

### Short Syntax: All Updating Fields



