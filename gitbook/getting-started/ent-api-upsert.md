# Ent API: upsert\*()

The `upsert*()`  call is a mix of INSERT and UPDATE operation, based on an Ent unique key.

## Ent.upsert(vc, { field: "...", ... }): string

This call tries to update an existing row in the database (i.e. a row with the same unique key **defined in Ent schema**). In case there is no such row yet, it inserts the new one.

Returns ID of the updated (or inserted) row.

You can rely on the behavior of `autoInsert`  and `autoUpdate`  fields: they work the same way as in regular `insert*()` and `update*()` calls.

Upsert can't work if some triggers are defined for the Ent, because we don't know Ent ID in advance (whether the upsert succeeds or skips on duplication).

Also, `upsert()` will refuse to run if there are Inverses defined on some Ent fields (same reason: Inverses operations run in a different microshard strictly before the main Ent operation, and they must know the row's ID in advance).

## Ent.upsertReturning(vc, { ... }): Ent

This call is very similar to `upsert()`, but in the end, it loads the updated (or inserted) Ent back from the datbase using `loadX()`.

Since `upsert()` is meant to always succeed (except when there is a transport error, or when some database constraint check unrelated to the main Ent's unique key fails), there are no "X" and "Nullable" variations of this method.

## Batching

Multiple `upsert*()` calls running in parallel are batched by Ent Framework:

```typescript
await Promise.all([
  EntTopic.upsert(vc, { 
    slug: "s1",
    creator_id: "123",
    subject: "test1",
  }),
  EntTopic.upsert(vc, {
    slug: "s2",
    creator_id: "456",
    subject: "test2",
  }),
]);
```

The batched query will look like this:

```sql
WITH rows(...) AS (VALUES
  ('s1', '123', 'test1'),
  ('s2', '456', 'test2')),
  updates AS (
    UPDATE topics SET ...
    FROM rows WHERE topics.slug=rows.slug
    RETURNING rows._key, topics.id AS id),
  inserts AS (
    INSERT INTO topics (id, ...)
    SELECT id_gen(), ...
    FROM rows WHERE _key NOT IN (SELECT _key FROM updates)
    ON CONFLICT (slug) DO UPDATE SET ...
    RETURNING NULL AS _key, id)
  SELECT _key, id FROM updates UNION ALL SELECT _key, id FROM inserts
```

It is complicated! In fact, the query runs UPDATE-INSERT-UPDATE sequence, to ensure that it doesn't  call `id_gen()`  in case the row already exists in the database (to not exhaust the sequence).
