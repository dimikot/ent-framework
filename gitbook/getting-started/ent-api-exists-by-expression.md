# Ent API: exists() by Expression

This is another privacy-unaware API call, similar to `count()`.

## **Ent.exists(vc, { field: "...", ... })**: boolean

Returns true if there isat least one Ent in the database matching the `where` condition. Works across multiple microshards too.

In terms of the logic, `exists()` call is similar to `count() > 0` check, with two performance optimizations:

1. It uses `EXISTS` SQL clause, which doesn’t read more tuples from the database than needed (as opposed to `count()` aggregate).
2. During the run, it severely reduces the weight (basically, the probability) of seqscan to happen (with `SET enable_seqscan=off` directive merged with the query). I.e. it implies that you must have a good index covering the `where` condition.

As all API calls in Ent Framework, multiple parallel `exists()` calls are batched into a single SQL query:

```typescript
const [exists1, exists2] = await Promise.all([
  EntTopic.exists(vc, { creator_id: "123" }),
  EntTopic.exists(vc, { updated_at: { $gt: new Date("2024-01-01") } }),
]);
```

This sends the following SQL query to the underlying database:

```sql
SET enable_seqscan=off;
SELECT EXISTS (SELECT true FROM topics WHERE creator_id='123')
  UNION ALL
SELECT EXISTS (SELECT true FROM topics WHERE created_at>'...')
```

The `exists()` call is even more useful to build custom privacy checks than `count()`, because it’s faster and almost guarantees using an index.
