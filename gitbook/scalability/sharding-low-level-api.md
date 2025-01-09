# Sharding Low-Level API

In [locating-a-shard.md](locating-a-shard.md "mention") article we discussed, how Ent Framework automatically determines, which shard to use for a particular Ent, based on the Ent ID.

But there is also a lower level set of methods in `Cluster` class, for the following use cases:

* when you want to manipulate the shards manually;
* when you don't want to encode the shard number in an ID for some reason;
* when you need to use transactions (`acquireConn()` API).

The API described below is exposed by `Cluster` class, see [locating-a-shard.md](locating-a-shard.md "mention").

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

## Sending SQL Queries via a Shard Client

`PgClient` class exposes 2 ways of sending queries to the database. (This applies to PostgreSQL; for other databases, especially non-SQL, the API is up to that `Client` class implementation.)

Internally, `PgClient` maintains a pool of open connections and reuses them automatically. It also works great together with [pgbouncer](https://www.pgbouncer.org) (or any other conections pooler for PostgreSQL) in both "transaction pooling" and "connection pooling" modes. (In real projects, you'll most likely want to use "transaction pooling".)

### pgClient.query(): Send a Single SQL Query

You can use `query()` method of `PgClient` to send singular SQL queries:

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

Before the query is executed, Ent Framework basically prepends it with `SET search_path TO sh0123` clause within the same "implicit transaction" of the "simple multi-query protocol". I.e. if you access some table without providing its schema name, then the table will be searched in the current shard's schema (`sh0123` in the above example).

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

This example is also pretty verbose: try not to use this API in your code directly; instead, introduce some higher-level wrappers.

## Other Ways of Accessing Shards

There are other methods in `Cluster` that allow you to access shards.

### cluster.globalShard(): Access a Global Shard

There is a special microshard in the cluster with number 0. It is called "global shard". Typically, the global shard lives on a separate island with more replicas, since it is used to store shared low cardinal data (like organizations, workspaces, user accounts etc.) that doesn't need to be sharded.

Calling `globalShard()` is the same as calling `shardByNo(0)`.

### cluster.nonGlobalShards(): Get the List of All Shards

This async method returns all microshard instances except the global shard:

```typescript
const shards = await cluster.nonGlobalShards();
```

### cluster.randomShard(): Get a Random Shard in the Cluster

When you insert a new row to the database, Ent Framework calls this method to choose a shard for the insertion. This happens for Ents with `shardAffinity` equals to `RANDOM_SHARD` (i.e. when the Ent is not colocated with some other parent Ent).

### cluster.shard(id): Get a Shard from the ID prefix

Earlier in [locating-a-shard.md](locating-a-shard.md "mention") article we disussed, what format an ID should have to work in microsharding environment:

<figure><img src="../.gitbook/assets/image.png" alt="" width="282"><figcaption></figcaption></figure>

If you have such an ID in a variable, a call to `cluster.shard(id)` will parse it and return a shard instance which you can then use to send low-level SQL queries to that shard.

## Working with Islands

Sometimes you want to work with even lower primitive than a microshard, with an island itself.&#x20;

This is helpful when your app has some background worker (or crawler) that needs to traverst through all records of a particular table, in all shards, and you want to control the processing parallelism: not more than 1 worker process per each island (to not overload the database with concurrent queries).

### cluster.islands(): Get All Islands of the Cluster

The method allows you to enumerate all islands of the cluster to e.g. spawn worker processes per each of them:

```typescript
const islands = await cluster.islands();
for (const island of islands) {
  await spawnWorkerIfNotRunningAlready(island.no);
}
```

Since Ent Framework supports real-time reconfiguration, the list of islands may change after the call to `islands()`, so be careful to run the above code from time to time.

### cluster.island(no): Get One Island by its Number

Then, in each worker process, you may want to get an instance of an isand with the number corresponding to that worker:

```typescript
async function worker(islandNo: number) {
  const island = await cluster.island(islandNo);
  const shardsOfIsland = island.shards();
  const master = island.master();
  const aliveReplica = island.replica();
  ...
}
```

### island.master(): Get a Client for Island Master Node

Previously, we learned that the queries sent to a "shard client" are delivered in the context of that shard's PostgreSQL schema (i.e. they run as if they are prefixed with `SET search_path TO sh0123` clause).

The queries sent to an "island client" are executed in the context of PostgreSQL schema `public`. In most of the cases, you'll want to override this and provide a particular schema name as a prefix of the table name:

```typescript
const master = island.master();
await master.query({
  query: ["SELECT email FROM sh0123.users WHERE id=?", userID],
  //                         ^^^^^^
  ...
});
```

### island.shards(): Get the Currently Known Shards on an Island

Island clients are typically used to build "cross-shard" queries on a particular island. The most common example is building a UNION ALL query that allows to load the data from multiple shards on the same island more effectively than going "shard after shard":

```typescript
const shards = island.shards();
const masters = await mapJoin(
  shards,
  async (shard) => shard.client(MASTER),
);
const query = masters
  .map((client) => `
    (SELECT id FROM ${client.shardName}.users
    WHERE needs_processing
    LIMIT 100)
  `.trim())
  .join("\n  UNION ALL\n);
const ids = await island.master().query({
  query,
  ...
});
```

Here, we ask the database to return us the users that "need to be processed" by the background job, from all shards of a particular island. From each shard, we return not more than 100 IDs. Considering that we have an index on the `WHERE` condition, such approach of crawling the users will be more effective than going "shard after shard".
