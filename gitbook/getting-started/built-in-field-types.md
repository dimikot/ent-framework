# Built-in Field Types

Before we move to the next Ent API calls, let's talk about the Ent field types that are natively supported in Ent Framework:

<table><thead><tr><th width="218">Field Definition</th><th width="155">TypeScript Type</th><th>PostgreSQL Type</th></tr></thead><tbody><tr><td>{ type: String }</td><td>string</td><td>varchar, text, bigint, numeric, ...</td></tr><tr><td>{ type: ID }</td><td>string</td><td>varchar, text, bigint, ...</td></tr><tr><td>{ type: Number }</td><td>number</td><td>int, bigint, doube, ...</td></tr><tr><td>{ type: Date }</td><td>Date</td><td>timestamptz, timestamp</td></tr><tr><td>{ type: Boolean }</td><td>boolean</td><td>boolean</td></tr><tr><td>{ type: YourCustomType }</td><td>see <a data-mention href="custom-field-types.md">custom-field-types.md</a></td><td>typically jsonc, bytea or anything else</td></tr></tbody></table>

You can also define custom field types: [custom-field-types.md](custom-field-types.md "mention")

Fields may be _nullable_ and _optional_, with the corresponding support from TypeScript side.

Nullability and optionality concepts are often times mixed up. In Ent Framework, they are independent on each other and are used for different use cases.

## Nullability: allowNull=true

By default, all fields can't store a `null` TypeScript value. To allow storing of a null, use the `allowNull` syntax:

```typescript
const schema = new PgSchema(
  "topics",
  {
    ...
    // TypeScript type will be: string | null.
    company_id: { type: ID, allowNull: true },
    // TypeScript type will be: string (non-nullable).
    slug: { type: String },
  },
  ["slug"]
);
```

**Notice that if your field is nullable, it doesn't mean that it is optional.** Nullability and optionality are independent concepts in both Ent Framework and TypeScript. E.g. you can have a required nullable field which allows saving `null` in it, but you will still need to explicitly pass this `null` in your TypeScript code:

```typescript
await EntTopic.insertReturning(vc, { slug: "abc" });
// ^ TypeScript error: missing required property, company_id.

await EntTopic.insertReturning(vc, { company_id: null, slug: "abc" });
// ^ OK.
```

By default, each field in the schema is **required at insert time**. I.e. if you run an `insert*()` call, then TypeScript won't let you skip a required field.

## Optionality: autoInsert="..."

To make a field optional, you can use `autoInsert="sql expression"` modifier: it makes the field optional at insert time. Ent Framework will use the raw SQL expression provided if you don't mention an explicit field value on an insert (which is convenient when doing refactoring for instance).

Several examples:

```typescript
const schema = new PgSchema(
  "topics",
  {
    // If not passed in insert*() call, uses nextval('topics_id_seq').
    id: { type: ID, autoInsert: "nextval('topics_id_seq')" },
    // If not passed in insert*() call, uses now().
    created_at: { type: Date, autoInsert: "now()" },
    // If not passed in insert*() call, uses NULL.
    company_id: { type: ID, allowNull: true, autoInsert: "NULL" },
    // Required AND non-nullable at the same time.
    slug: { type: String },
  },
  ["slug"]
);
```

Notice that now `company_id` field is both _optional_ and _nullable_. I.e. you can run this code:

```typescript
await EntTopic.insertReturning(vc, { slug: "abc" });
// ^ OK: company_id is both optional and nullable.
```

An example of optional, but non-nullable field is `created_at`. I.e. you can omit this field when inserting (and thus, Ent Framework will use `now()` SQL expression for its value), but you can't pass a `null` TypeScript value there, and your `topic.created_at` will be of type `Date`, not `Date | null` or `Date | undefined`.

### autoUpdate

There is also one more way to mark the field as optional, use `autoUpdate` modifier. It is very similar to `autoInsert`, but additionally, if the value is omitted at an `update*()` call, then it will be automatically set to the result of the provided SQL expression. A classical use case for it is `updated_at` field:

```typescript
const schema = new PgSchema(
  "topics",
  {
    // Defaults to now() if not mentioned at insert time.
    created_at: { type: Date, autoInsert: "now()" },
    // Auto-set to now() if not mentioned at update time.
    updated_at: { type: Date, autoUpdate: "now()" },
    ...
  },
  ["slug"]
);
```
