# Sharding Low-Level API

In [locating-a-shard.md](locating-a-shard.md "mention") article we discussed, how Ent Framework automatically determines, which shard to use for a particular Ent, based on the Ent ID.

But there is also a lower level set of methods in `Cluster` class, for the cases when you want to manipulate the shards manually, or when you don't want to encode the shard number in an ID for some reason.

The API described below is exposed by `Cluster` class:

```typescript
export const cluster = new Cluster({
  islands: () => [ // <-- callback
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
  ...,
});
```

## cluster.shardByNo(): Get a Shard by its Number

This is the simplest way to get an instance of `Shard` class (representing a microshard) by its number:

```typescript
const shard = cluster.shardByNo(42);
const pgClient = await shard.client(MASTER);
```

Having a `Shard` object, you obtain a `Client` instance (in our case, `pgClient`) which enbles access to one of the nodes backing that shard.&#x20;

## Sending SQL Queries via a Client

`PgClient` class exposes 2 ways of sending queries to the database. (This applies to PostgreSQL; for other databases, especially non-SQL, the API is up to that `Client` class implementation.)

## pgClient.query(): Send a Single SQL Query

```typescript
const rows = await pgClient.query({
  query: ["SELECT email FROM users WHERE id=?", userID],
  isWrite: false,
  annotations: [vc.toAnnotation()],
  op: "MY_SELECT",
  table: "users",
  // Optional properties.
  hints: { enable_seqscan: "off" },
  batchFactor: 1,
});
```

Notice that `query()` API is pretty verbose: it is not meant to be used in the code directly, introduce your own wrapper if you find yourself sending raw SQL queries frequently. (But better use Ent Framework's calls which hide all of the complexity behind a graph-like language.)

Some properties like `annotations`, `op` and `table` are used for instrumentation purposes only. It is highly recommended to pass them, since it will make the built-in Ent Framework logging meaningful.

### pgClient.acquireConn(): Get a Low-Level node-postgres Client

If you want to get access to the native API of [node-postgres](https://www.npmjs.com/package/pg) library (to use transactions, streaming etc.), use the following code:

```typescript
const conn = await client.acquireConn();
try {
  ...
} finally {
  conn.release();
}
```
