# Ent API: selectBy() Unique Key Prefix

Similar to how `loadBy()` loads a single Ent by its unique key, `selectBy()` call loads _multiple_ ents by their **unique key prefix**.

## Ent.selectBy(vc, { field: "...", ... }): Ent\[]

Loads the Ents matching the predicate, considering the predicate is a list of fields from your unique key prefix.

Logically, you can load the same Ents by just `select()` call, but then, while batching, it will produce a `UNION ALL` clause, which is less efficient and may cause performance problems when a large number of calls are batched. In contrast, `selectBy()` never produces a `UNION ALL` clause, but the price we pay for it is the implication that we can only select by the unique key _prefix_, not by an arbitrary predicate.

All in all, you’ll rarely need to use `selectBy()` in your code. It is used interally though to fetch [Inverses](../architecture/ent-framework-metas-tao-entgo.md#no-explicit-assocs) efficiently.&#x20;

Let’s actually use Inverses to illustrate, how `selectBy()` works. Internally, the Inverses Ent schema looks like this:

```typescript
const schema = new PgSchema(
  name,
  {
    id: { type: ID },
    created_at: { type: Date, autoInsert: "now()" },
    type: { type: String },
    id1: { type: ID },
    shard2: { type: Number },
  },
  ["type", "id1", "shard2"],
)
```

## Simple Batching

Sometimes, when Ent Framework needs to discover the full list of microshards on the opposite end of some field edge, it internally runs the following calls in parallel:

<pre class="language-typescript"><code class="lang-typescript">await Promise.all([
  EntInverse.selectBy(vc, { type: "user2topics", id1: "123" }),
  EntInverse.selectBy(vc, { type: "user2topics", id1: "456" }),
<strong>]);
</strong></code></pre>

Notice that in this example, all parallel calls use the same prefix (`type: "user2topics"`), but the very last selection field varies. For such a case (which is actually pretty common), to produce the most optimal PostgreSQL execution plan, Ent Framework builds the following batched SQL query:

```sql
SELECT * FROM inverses
WHERE type='user2topics' AND id1 IN('123', '456')
```

## Complex Batching

Unfortunately, the above query stops being optimal when the prefix differs across multiple parallel calls. Consider this example:

<pre class="language-typescript"><code class="lang-typescript">await Promise.all([
  EntInverse.selectBy(vc, { type: "user2topics", id1: "123" }),
  EntInverse.selectBy(vc, { type: "user2topics", id1: "456" }),
  EntInverse.selectBy(vc, { type: "topic2comments", id1: "789" }),
<strong>]);  
</strong></code></pre>

Assume we try to build the batched query using the same approach as above:

```sql
-- DON'T DO IT!
SELECT * FROM inverses WHERE
  (type='user2topics' AND id1 IN('123', '456')) OR
  (type='topic2comments' AND id1 IN('789'))
```

In this case, PostgreSQL will often times produce a suboptimal plan with "bitmap index scan" instead of "index scan". This is partially due to the fact that our DB unique index is by `(type, id1, shard2)`, and we only utilize its prefix `(type, id1)`.

Luckily, there is another query plan which is used by Ent Framework in such a case:

```sql
-- Good plan!
SELECT * FROM inverses WHERE (type, id1) IN(VALUES(
  ('user2topics', '123'),
  ('user2topics', '456'),
  ('topic2comments', '789')
))
```

It produces an optimal query plan for the cases when prefixes differ. (BTW, it loses in the situations when the prefix is common, for which `AND id1 IN(...)` clause plays better.)
