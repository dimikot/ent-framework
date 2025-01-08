# Locating a Shard

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

Here, we use `id_gen()` function from pg-id library, which by default generates the IDs in the format we mentioned above:

```
EssssRRRRRRRRRRRRRR
 ^   ^^^^^^^^^^^^^^
 4   14
```

The complete list of `id_gen*()` functions are:

* `id_gen()`: generates next globally-unique randomly-looking id. The main idea is to not let external people infer the rate at which the ids are generated, even when they look at some ids sample. The function implicitly uses a sequence to get the information about the next available number, and then uses [Feistel cipher](https://en.wikipedia.org/wiki/Feistel_cipher) to generate a randomly-looking non-repeating ID based off it.
* `id_gen_timestampic()`: similar to `id_gen()`, but instead of generating randomly looking ids, prepends the "sequence" part of the id with the current timestamp.
* `id_gen_monotonic()`: the simplest and fastest function among the above: generates next globally-unique monotonic id, without using any timestamps as a prefix. Monotonic ids are more friendly to heavy INSERTs since they maximize the chance for btree index to reuse the newly created leaf pages.
