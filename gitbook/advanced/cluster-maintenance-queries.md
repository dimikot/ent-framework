# Cluster Maintenance Queries

During its work, Ent Framework cluster runs various queries in background, invisible to the user.

## Connectons Prewarming

In [connect-to-a-database.md](../getting-started/connect-to-a-database.md "mention") article, we briefly mentioned `cluster.prewarm()` call. The goal of this feature is to let Ent Framework keep the minimal number of open database connections per each client pool (e.g. per each `PgClientPool`). Having ready open connections means that the queries can be processed immediately (connection establishment is expensive, especially when it uses SSL and/or a proxy solution like pgbouncer).

Prewarming is done by sending a simple SQL query to the pool from time to time, in controlled parallel bursts. You can customize the query Ent Framework sends with `PgClientPoolOptions#prewarmQuery` property.

When Ent Framework boots in the Node process, it does not start sending all those prewarm queries immediately. Instead, it waits for a random time period (also configurable in `PgClientPoolOptions`, but you may rely on the default value), and also it first prewarms 1 connection, then 2, then 3 etc. until it reaches the `min` value passed to the client's config.

## Shards Rediscovery

From time to time, Ent Framework polls all of the Cluster nodes to get the list of active microshards on those nodes.

It also runs such a poll immediately in the following rare cases:

1. When the very 1st query arrives, and there is no yet info about the microshards in the cluster.
2. When a query fails with "table not found" exception. It is often times the case when a microshard has just [moved](../scalability/shards-rebalancing-and-pg-microsharding-tool.md) from one island to another, so the cluster needs to be rediscovered.

## Cluster Reconfiguration

From time to time, Ent Frameworks calls `islands` callback from Cluster object options, to figure out whether some new islands or nodes were added to the cluster, or some nodes were removed. This allows you to dynamically change the cluster configuration in memory without restarting Node process.

## Jitter

All of the periodic maintenance operations are done with slightly different and randomized time intervals between them. This approach is called "jitter".

Imagine that you have, say, 500 Node processes in the cluster running Ent Framework, and you boot all 500 processes at the same time when deploying your app. (This may easily happen in automatic deployment environment like Kubernetes or AWS ECS.) If not the jitter, then those 500 processes would start hammering all your databases with new connections and maintenance queries at the same time. And worse, they would continue doing it in spike, on each new "tick" of the maintenance loops.

It is especially deadly when using SSL and [pgbouncer](https://www.pgbouncer.org) : since pgbouncer is single-threaded, when it receives a burst of new connections, it severely overloads the CPU core, which causes the connections and queries to timeout and be retried.

Having jitter helps in this situation perfectly.

## Tweaking Maintenance Operations

Normally, you don't need to tweak any of the parameters (time intervals and jitters) mentioned above, since Ent Framework has sane defaults for them. In case you still have to, then look at `PgClientPoolOptions` and `ClusterOptions` interfaces.
