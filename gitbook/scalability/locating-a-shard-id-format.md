# Locating a Shard and ID Format

To enable microshardig support, we first need to configure the instance of `Cluster` class:

```typescript
export const cluster = new Cluster({
  islands: () => [
    {
      no: 0,
      nodes: [
        { name: "abc-instance-1", host: "...", ... },
        { name: "abc-instance-2", host: "...", ... },
      ],
    },
    {
      no: 1,
      nodes: [
        { name: "abc-instance-3", host: "...", ... },
        { name: "abc-instance-4", host: "...", ... },
      ],
    },
  ],
  shards: {
    nameFormat: "sh%04d",
    discoverQuery:
      "SELECT nspname FROM pg_namespace WHERE nspname ~ 'sh[0-9]+'",
  },
  ...,
});
```

## Shards Discovery

Notice the `shards` configuration property above.

* `nameFormat`: this sprintf-style template defines, how Ent Framework should build the microshard schema name when it knows the microshard number. In our case, the schema names will look like `sh0123` or `sh0000`, and there will be up to 10000 microshards allowed.
* `discoverQuery`: Ent Framework will run this query on all islands from time to time to figure out, what shards are located where. It will also run this query immediately in several conditions, like "table not found" error (which may mean that a microshard has just been moved from one island to another, so Ent Framework needs to rediscover).

There is also pg-microsharding library which allows you to manipulate microshard schemas: create them, activate, move and rebalance microshards across islands. When this library is used, you can utilize `SELECT * FROM unnest(microsharding.list_active_shards())` as a value for `discoverQuery`.

As of the islands in the cliuster, just enumerate them and their nodes. Ent Framework will figure out, what nodes are masters and whan nodes are replicas. You can also change the list of islands and nodes in real-time, without restarting the app: Ent Framework is smart enough to pick up the changes if `islands` callback returns a different value (it is called from time to time).

## Format of IDs

Assume we have the following call:

```typescript
const user = EntUser.loadX(vc, id);
```

When users are distributed across multiple microshards, Ent Framework decides, which microshard should it query the data from. The decision is made based on the ID prefix:

<figure><img src="../.gitbook/assets/image.png" alt="" width="282"><figcaption></figcaption></figure>

To use the default microshard location strategy, there is a convention on ID format, it must consist of 3 parts:

* `"1"` (Environment Number): you may want to make your IDs globally unique across the entire world, so all IDs in dev environment will start from e.g. 1, IDs in staging with 2, and IDs in production with 3.
* `"0246"` (Shard Number): this is where the microshard number reside in the ID structure. In the code, it is also referred as "Shard No".
* `"57131744498804"` (Entropy): a "never-repeating random-looking" part of the ID. It may not necessarily be random (other strategies are "auto-incremental" and "timestamp-based"), i.e. the concrete generation algorithm it's up to the library which generates the new IDs.

Ent ID (and thus, its microshard number) is determined once, at the time when the Ent is inserted. Typically, each microshard schema has its own function that build the IDs, fills the environment and shard number, generates the "never-repeating random-looking" part:

```typescript
const schema = new PgSchema(
  "users",
  {
    id: { type: ID, autoInsert: "id_gen()" },
    email: { type: String },
  },
  ["email"]
);
```

Here, we use `id_gen()` function from [pg-id](https://www.npmjs.com/package/@clickup/pg-id) library, which by default generates the IDs in the format we mentioned above:

```
EssssRRRRRRRRRRRRRR
 ^   ^^^^^^^^^^^^^^
 4   14
```

## Stored Functions in pg-id Library

The complete list of `id_gen*()` functions in [pg-id](https://www.npmjs.com/package/@clickup/pg-id) library are:

* `id_gen()`: generates next globally-unique randomly-looking id. The main idea is to not let external people infer the rate at which the ids are generated, even when they look at some ids sample. The function implicitly uses a sequence to get the information about the next available number, and then uses [Feistel cipher](https://en.wikipedia.org/wiki/Feistel_cipher) to generate a randomly-looking non-repeating ID based off it.
* `id_gen_timestampic()`: similar to `id_gen()`, but instead of generating randomly looking ids, prepends the "sequence" part of the id with the current timestamp.
* `id_gen_monotonic()`: the simplest and fastest function among the above: generates next globally-unique monotonic id, without using any timestamps as a prefix. Monotonic ids are more friendly to heavy INSERTs since they maximize the chance for btree index to reuse the newly created leaf pages.
* `id_gen_uuid()`: returns an ID in UUID format (PostgreSQL `uuid` type) with first several digits assigned to `Essss` prefix as in all other functions above.

## Using UUID v4 for ID Fields

You can also use `id_gen_uuid()` function if you want your primary keys to be in UUID v4 format (or utilize the built-in PostgreSQL function [`gen_random_uuid()`](https://www.postgresql.org/docs/current/functions-uuid.html)  in case you don't need microsharding support).

The UUID generated by that function looks like this:

```
10246xxx-xxxx-4xxx-Nxxx-xxxxxxxxxxxx
```

Here, as in the previous examples, `1` is environment number (e.g. production), `0246` is microshard number, `4` is the UUID version field and `N` is a so-called "variant". All other digits are randomly generated.&#x20;

Notice that `id_gen_uuid()` replaces the first several digits in the string representation of UUID with the information regarding environment and microshard numbers. This trick doesn't cut too much of the UUID's entropy (UUID is 16 bytes; compare it to 8 bytes of `bigint`), but allows to use UUIDs in microsharded environment.

## Why Using Database Generated IDs?

Let's get back to the previous example of an ID field definition:

```typescript
const schema = new PgSchema(
  "users",
  {
    id: { type: ID, autoInsert: "id_gen()" },
    ...
  },
  ...
);
```

Also, the corresponding SQL table schema in every microshard is:

```sql
CREATE TABLE users(
  id bigint PRIMARY KEY DEFAULT id_gen(),

  ...
)
```

(In case you want to UUID IDs, use the built-in PostgreSQL type `uuid`.)

### id\_gen() is Mentioned in Two Places

Technically, you don't have to include `DEFAULT id_gen()` clause in your SQL table definition. For Ent Framework to operate, it's fully enough to define just `autoInsert="id_gen()"`.

But we strongly advise to have both. Otherwise, you won't be able to e.g. connect to a node with `psql` and run `INSERT INTO users ...` safely, without thinking of IDs generation. It will also be hard to build database triggers if they insert `users` rows.&#x20;

### autoInsert is a String Property, not a Callback

You probably wondered, why Ent Framework doesn't support `autoInsert` being a TypeScript callback? Why do we always ask the database to generate IDs and do not support application code ID generation (especially for UUIDs)?

There are several reasons for this.

1. As mentioned above, the best practice is to have the `autoInsert` expression defined in both Ent Framework schema and in the SQL table definition. Thus, we need an approach available in both TypeScript and SQL worlds, which is using an SQL expression as a string. (BTW, for non-ID fields, other available values for `autoInsert` are: `"now()"`, `"NULL"` or even `"'{}'"` for e.g. an empty array.)
2. When building batched INSERTs, Ent Framework uses the expression from `autoInsert` directly in the batched SQL queries.
3. If an Ent class has `beforeInsert` triggers, Ent Framework runs the expressions from `autoInsert` in a separate query, so the generated IDs are available in `beforeInsert` triggers, even though the row is not yet inserted into the table. This allows to build "eventually consistent" logic without transactions. See more details about this in [triggers.md](../getting-started/triggers.md "mention") article.



