# Ent API: count() by Expression

Count API is similar to `select()`, but instead of loading the matching Ents, it counts them.

## **Ent.count(vc, { field: "...", ... }): number**

Returns the number of Ents matching the `where` condition. Works across multiple microshards.

As usual, if multiple `count()` calls for the same Ent are run in parallel, they are internally batched into a single SQL query:

```typescript
const [count1, count2] = await Promise.all([
  EntTopic.count(vc, { creator_id: "123" }),
  EntTopic.count(vc, { updated_at: { $gt: new Date("2024-01-01") } }),
]);
```

This sends the following SQL query to the underlying database:

```sql
SELECT count(1) FROM topics WHERE creator_id='123'
  UNION ALL
SELECT count(1) FROM topics WHERE created_at>'...'
```

As opposed to `select()`, `load*()` and `loadBy*()` calls, `count()` is privacy-unaware: it does not run privacy checks. This is partially a technical limitation (to recheck privacy, one needs to load the actual rows from the database, and count() doesn’t do it). But also, it’s an intended behavior: with `count()`, it’s convenient to build custom privacy checks and avoid "chicken and egg" problem (to build a privacy check, you eventually need to run a privacy-unaware calls at the very bottom of the stack).
