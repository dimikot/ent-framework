# Composite Primary Keys

In each Ent instance, there is always a property named `id`.&#x20;

Ent Framework follows the pattern "convention over configuration" to simplify the most frequent use cases. In the world of database, the approach of having an explicit primary key `id` field (typically, generated based on some sequence) is considered a best practice.

There are still databases where it's not the case though. You can use Ent Framework for them by utilizing the composite (or custom) primary keys feature.

{% hint style="info" %}
It is strongly recommended to define an explicit `id` column on your tables though, since it solves many other problems and is just convenient in practice. Do not over-engineer, use the standard approaches.
{% endhint %}

## Multi-Column Composite Primary Key

Let's start with an example:

```sql
CREATE TABLE memberships(
  group_id bigint NOT NULL,
  member_id bigint NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (group_id, member_id)
);
```

And the corresponding Ent class:

```typescript
const schema = new PgSchema(
  "memberships",
  {
    group_id: { type: ID },
    member_id: { type: ID },
    created_at: { type: Date, autoInsert: "now()" },
  },
  ["group_id", "member_id"],
);

export class EntMembership extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: async (_vc, row) => row.member_id,
      privacyLoad: [...],
      privacyInsert: [...],
    });
  }
}
```

This Ent schema doesn't have an `id` property, and thus, Ent Framework understands that it should use the Ent's unique key `group_id, user_id` instead.

So, it's that simple: if you don't define `id` field in the schema, then your schema's unique key becomes the primary key.&#x20;

Despite not defining an `id` field in the schema, your Ent instances will have it!

```typescript
const membership = await EntMembership.insertReturning(vc, {
  group_id: "100001001",
  member_id: "100001002",
});
// This prints "(100001001,100001002)"
console.log(membership.id);
// This also works!
const reloaded = EntMembership.loadX(vc, "(100001001,100001002)");
// All other Ent calls work too.
await membership.deleteOriginal();
```

Basically, if you don't have an `id` field in the schema, Ent Framework will create it for you and put a PostgreSQL unique key tuple in it. Tuples are a standard PostgreSQL syntax, and they look like: `(100001001,100001002)`.

There is no way to define both a composite primary key and a different unique key in an Ent class. It's also impossible to have more than 1 unique key in a particular Ent schema. But it doesn't mean you can't define more right in your database itself (at SQL table level) and then use them in custom `select()` queries: of course you can. It is just considered an anti-pattern for most of the cases.

## Single-Column Custom Primary Key

If your unique key includes only 1 field, and there is no `id` property defined in the schema, that field becomes the value of Ent instance's `id` field. This is what you would naturally expect.

```sql
CREATE TABLE users(
  email varchar(64) NOT NULL PRIMARY KEY,
  name varchar(128) NOT NULL,
  created_at timestamptz NOT NULL
);
```

And the corresponding Ent class:

```typescript
const schema = new PgSchema(
  "users",
  {
    email: { type: String },
    name: { type: String },
    created_at: { type: Date, autoInsert: "now()" },
  },
  ["email"],
);

export class EntUser extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: async (_vc, row) => row.email,
      privacyLoad: [...],
      privacyInsert: [...],
    });
  }
}
```

Now notice how it's used:

```typescript
const user = await EntUser.insertReturning(vc.toOmniDangerous(), {
  email: "test@example.com",
  name: "Alice",
});
// This prints "test@example.com" (no parentheses).
console.log(user.id);
// VC's principal is also "test@example.com".
console.log(user.vc.principal);
// This also works!
const reloaded = EntMembership.loadX(vc, "test@example.com");
// All other Ent calls work too.
await membership.deleteOriginal();
```

Still, it's highly discouraged to do such things when you add a new table to your service. Better follow the best practices and add a regular `id` field. You can still use a custom primary key, but then you lose an ability to use other field(s) as a separate unique key in your schema.
