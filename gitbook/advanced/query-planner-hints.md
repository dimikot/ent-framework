# Query Planner Hints

Another PostgreSQL specific feature (probably the most popular one among the [other custom options](postgresql-specific-features.md)) is giving the PostgreSQL planner some hints on how you prefer the query to be executed.

## GUC (Grand Unified Configuration) Settings

E.g. if your table contains data with very different cardinality of a particular field, and you see that PostgreSQL runs a seqscan sometimes, you may try to lower the seqscan priority:

```typescript
const comments = await EntComment.select(
  vc,
  { topic_id: topicID },
  100,
  [{ created_at: "DESC" }],
  { hints: { enable_seqscan: "off" } },
);
```

The planner settings like [enable\_seqscan](https://www.postgresql.org/docs/current/runtime-config-query.html#GUC-ENABLE-SEQSCAN) do not fully prevent sequential scan, but they greatly reduce its probability, in case you know what you're doing.

If your query is intentionally a sequential scan or just works with lots of rows in the table, does [JOINs uses WITH custom clauses](postgresql-specific-features.md), then you may also want to increase `work_mem` for it, to lower the chance of using temporary files:

```typescript
const comments = await EntComment.select(
  vc,
  { topic_id: topicID },
  100,
  [{ created_at: "DESC" }],
  { hints: { work_mem: "100MB" } },
);
```
