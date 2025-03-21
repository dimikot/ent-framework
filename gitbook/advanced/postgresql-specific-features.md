# PostgreSQL Specific Features

Earlier we described the engine-independent features of [select() API call](../getting-started/ent-api-select-by-expression.md).

The default `select()` call (as all other Ent API calls) is generic and engine independent, be it PostgreSQL or any other database. In addition to that, `select()` allows to pass the last optional engine-specific argument, to let you use the most of PostgreSQL features without falling back to vanilla SQL queries prematurely.

```typescript
const comments = await EntComment.select(
  vc,
  { creator_id: "101" },
  20,
  undefined, // order
  custom, // untyped, but of type SelectInputCustom
);
```

Despite the last optional parameter is an untyped object, it in fact accepts the following structure:

```typescript
type SelectInputCustom ={
  ctes?: Literal[];
  joins?: Literal[];
  from?: Literal;
  hints?: Record<string, string>;
}
```

An artificial usage example:

```typescript
const comments = await EntComment.select(
  vc,
  { created_at: { $gt: yesterdayDate } },
  10,
  [{ created_at: "DESC" }],
  {
    // WITH clauses (Common Table Expressions).
    ctes: [
      [
        "recent_topics AS (SELECT * FROM topics WHERE created_at > ?)",
        yesterdayDate,
      ],
      [
        "recent_comments AS (SELECT * FROM comments WHERE created_at > ?)",
        yesterdayDate,
      ],
    ],
    // A replacement for the entire FROM clause.
    from: ["recent_comments"],
    // Clauses after FROM.
    joins: [
      [
        "JOIN recent_topics t ON t.id = topic_id AND comment_count > ?",
        minComments,
      ],
    ],
    // Parameters like enable_seqscan, enable_bitmapscan etc.
    hints: {
      enable_seqscan: "off",
    }
);
```

Of course, this all works only within one microshard. You can't use JOINS or WITH statements targeting different microshards.

Continue reading: [query-planner-hints.md](query-planner-hints.md "mention").

