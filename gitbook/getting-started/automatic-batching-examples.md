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

SQL query produced:

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

All Ent Framework API calls are subject for batching the way described above.
