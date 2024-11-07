# Ent API: loadBy\*() Unique Key

Each Ent usually has an `id` field, serving as its primary key. This enables other Ents to reference it and allows for the use of the highly optimized `loadX(vc, id)` method to load by ID.

Some Ents may also have a **secondary unique key**. This could be a single text field or a combination of multiple fields. For example, `EntUser` might have an `email` field that must be unique across all `EntUser` rows in the database:

To use a unique key, define it in the Ent's schema and ensure that the corresponding unique index exists in the database:

```typescript
const schema = new PgSchema(
  "users",
  {
    id: { type: ID, autoInsert: "nextval('users_id_seq')" },
    email: { type: String },
  },
  ["email"]
);
```

Once set up, you can use the following methods to load by a unique key:

* **loadByX(vc, { email: "test@example.com" })**: loads an Ent by its unique key defined in the schema. If no matching row is found in the table, throws an `EntNotFound` error.
* **loadByNullable(vc, { email: "test@example.com" })**: works the same way as the above method, but returns `null` if no matching Ent is found.

### Batching and Prefix Grouping

As always, if multiple `loadBy*()` calls occur in parallel, Ent Framework batches them into a single SQL query to save on the connections utilization, latency and index usage.

If the unique key consists of a single field (e.g., `email`), the batched query for:

```typescript
const [user1, user2] = await Promise.all([
  EntUser.loadByX(vc, { email: "test1@example.com" }),
  EntUser.loadByX(vc, { email: "test2@example.com" }),
]);
```

looks like this:

```sql
SELECT * FROM table WHERE email IN('test1@example.com', 'test2@example.com');
```

For a composite unique key (e.g., `creator_id` and `slug`), the batched query for:

```typescript
const topics = await Promise.all([
  EntTopic.loadByX(vc, { creator_id: "123", slug: "abc" }),
  EntTopic.loadByX(vc, { creator_id: "123", slug: "def" }),
  EntTopic.loadByX(vc, { creator_id: "456", slug: "ghi" }),
  EntTopic.loadByX(vc, { creator_id: "456", slug: "jkl" }),
]);
```

is more complex:

```sql
SELECT * FROM table WHERE
  (creator_id='123' AND slug IN('abc', 'def')) OR
  (creator_id='456' AND slug IN('ghi', 'jkl'));
```

In other words, the engine groups the requests by the **prefix of the unique key, excluding the last field**, and then uses an `IN` clause for the values of the last field. This strategy allows the database to utilize its B-tree unique indexes efficiently. Just make sure that the column order in the database index matches the field order in the unique key in Ent's schema, and that columns with the lowest cardinality appear first in the unique index prefix.
