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

Of course, Ent Framework changes the GUC settings during the query execution period only, and guarantees that they are restored after. Internally,  `SET LOCAL ... RESET` are used for that (running within the same transaction of the multi-query).

Also, batching is done with respect to the planner hints. Only the SELECT queries having the same set of hints are potentially batched together with `UNION ALL` clause, as explained in [ent-api-select-by-expression.md](../getting-started/ent-api-select-by-expression.md "mention") article.

See [PostgreSQL documentation](https://www.postgresql.org/docs/current/runtime-config.html) for the full list of settings you can customize per query (notice that not all of them allow per-query changing: some require a database restart).

## Using pg\_hint\_plan Extension

There is a special hint with `""` (empty string) name. It allows to raw-prepend an arbitrary string in front of the query that Ent Framework sends to the database.

The raw-prepend hint is useful when e.g. working with PostgreSQL extensions like [pg\_hint\_plan](https://github.com/ossc-db/pg_hint_plan). This extension enables a **way** greater level of planning customization. You can even tell PostgreSQL, which exact index it must use for your query:

```typescript
const comments = await EntComment.select(
  vc,
  { topic_id: topicID },
  100,
  [{ created_at: "DESC" }],
  {
    hints: {
      [""]: "/*+IndexScan(comments comments_created_at_idx)*/",
      work_mem: "10MB",
      statement_timeout: "20s",
    },
  },
);
```

The resulting SQL multi-query (one transaction) sent to the server will then look like:

```sql
/*+IndexScan(comments comments_created_at_idx)*/
SET LOCAL search_path TO sh0123;
SET LOCAL work_mem TO 10MB;
SET LOCAL statement_timeout TO 20s;
SELECT ... FROM comments WHERE topic_id=? LIMIT 100;
RESET statement_timeout;
RESET work_mem;
SELECT pg_last_wal_replay_lsn();
```

Since it's a multi-query, there will be only one round-trip to the server and one transaction.
