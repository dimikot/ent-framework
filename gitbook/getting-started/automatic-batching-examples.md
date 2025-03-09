# Automatic Batching Examples

In the previous chapter, we talked about Ent Framework calls batching. Let's provide some more examples.

## Batching of load\*() Calls

The following code will produce only one SQL  query:

```typescript
await Promise.all([
  EntTopic.loadX(vc, "123"),
  EntTopic.loadX(vc, "456"),
  EntTopic.loadX(vc, "789"),
]);
```

SQL query produced under the hood:

```sql
SELECT * FROM topics WHERE id IN(...)
```

## Batching of insert\*() Calls

Since `insertReturning()` first inserts the Ent into the database and then loads the inserted data back, the following code will produce 2 SQL queries.

```typescript
await Promise.all([
  EntTopic.insertReturning(vc, { ... }),
  EntTopic.insertReturning(vc, { ... }),
  EntTopic.insertReturning(vc, { ... }),
]);
```

SQL queries produced:

```sql
INSERT INTO topics (...) VALUES ... RETURNING id;
SELECT * FROM topics WHERE id IN(...);
```

Even if `insertReturning()` is called in nested functions, Ent Framework will still batch them properly and produce just 2 queries:

```typescript
async function insertTopicsBatch(n: number) {
  await mapJoin(range(n), async (i) => EntTopic.insertReturning(vc, { ... }));
}
...
await Promise.all([
  insertTopicsBatch(42),
  insertTopicsBatch(101),
]);
```

## Batching of Update, Delete and all Other Calls

All Ent Framework API calls are subject for batching the way --described above.

## De-batching and Deadlocks

As in most of MVCC databases, In PostgreSQL, reads never block writes, and writes never block reads. Still, if two clients update the same row in the database, one client has to wait for another one to finish.

If the order of row updates is different in two clients, there is a change of [deadlocks](https://www.postgresql.org/docs/current/runtime-config-locks.html). E.g. imagine Alice updates row A and then row B in the same transaction, whilst Bob first updates B and then A. In this case, Alice will wait until Bob finishes updating row B, but at the same time, Bob will wait until Alice commits the transaction updating A. Thus, they would wait for each other infinitely, and PostgreSQL will cancel one of the transactions. (Notice that this situation never happens when both Alice and Bob update rows A and B in the same order.)

Deadlocks may occur during the automatic queries batching. It is rare (especially since Ent Framework always orders the updating rows in a consistent way, by e.g. id), but may still happen.

In case of a rare deadlock, when Ent Framework knows that it's safe to retry the write, it performs _de-batching_: splits the batched query into individual queries and runs them in parallel, independently. This solves the problem of deadlocks entirely, in an exchange of very rare slowdown of the mass insert, update or delete operations.



