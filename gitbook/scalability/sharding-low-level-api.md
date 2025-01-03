# Sharding Low-Level API

In [locating-a-shard.md](locating-a-shard.md "mention") article we discussed, how Ent Framework automatically determines, which shard to use for a particular Ent, based on the Ent ID.

But there is also a lower level set of methods in `Cluster` class, for the following use cases:

* when you want to manipulate the shards manually;
* when you don't want to encode the shard number in an ID for some reason;
* when you need to use transactions (`acquireConn()` API).

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
import { MASTER } from "ent-framework";

const shard = cluster.shardByNo(42);
const pgClient = await shard.client(MASTER);
```

{% hint style="info" %}
Notice that `shardByNo()` is synchronous: it doesn't even check that such shard exists in the cluster. Instead, all errors are processed later, at the time when `shard.client()` is called.
{% endhint %}

Having a `Shard` object, you obtain a `Client` instance (in our case, `pgClient`) which enbles access to one of the nodes backing that shard.&#x20;

As of the client's node role, you can pass `MASTER` (to access the master database client) or `STALE_REPLICA` (to access a random and arbitrarily lagging replica).

You can also pass an instance of `Timeline` object to utilize the automatic replication lag tracking and let Ent Framework decide, whether it can choose a replica, or it should use the master this time:

```typescript
const timeline = vc.timeline(shard, "users");
const pgClient = await shard.client(timeline);
```

## Sending SQL Queries via a Client

`PgClient` class exposes 2 ways of sending queries to the database. (This applies to PostgreSQL; for other databases, especially non-SQL, the API is up to that `Client` class implementation.)

Internally, `PgClient` maintains a pool of open connections and reuses them automatically. It also works great together with [pgbouncer](https://www.pgbouncer.org) (or any other conections pooler for PostgreSQL) in both "transaction pooling" and "connection pooling" modes. (In real projects, you'll most likely want to use "transaction pooling".)

## pgClient.query(): Send a Single SQL Query

Singular SQL queries can be sent using `query()` method of `PgClient`:

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

{% hint style="info" %}
Overall, `query()` works similarly to "session pooling" mode in popular PostgreSQL poolers like pgbouncer. It's the exact method which Ent Framework higher level calls (like `loadX()` or `insert()`) use.
{% endhint %}

### pgClient.acquireConn(): Get a Low-Level node-postgres Client

If you want to access the native [node-postgres](https://node-postgres.com) library API (Node module: "pg") to use transactions, streaming etc., use the following code:

```typescript
import { PoolClient } from "pg";

const conn: PoolClient = await client.acquireConn();
try {
  await conn.query("BEGIN");
  const res = await conn.query(
    "INSERT INTO users(email) VALUES($1) RETURNING id",
    ["test@example.com"],
  );
  await conn.query(
    "INSERT INTO photos(user_id, photo_url) VALUES ($1, $2)",
    [res.rows[0].id, "s3.bucket.foo"],
  );
  await conn.query("COMMIT");
} catch (e) {
  await conn.query("ROLLBACK");
  throw e;
} finally {
  // Don't forget to ALWAYS call release() to put the connection
  // back to the pool, including when an error happened, otherwise
  // it will all explode badly.
  conn.release();
}
```

This code is also pretty verbose: try not to use this API in your code directly; instead, introduce some higher-level wrappers.
