# Sharding and Microsharding

[replication-and-automatic-lag-tracking.md](replication-and-automatic-lag-tracking.md "mention") is not a silver bullet: you get fault tolerance and linear reads scaling, but there are limitations too:

1. **You can't scale writes.** Eventually, your single master CPU will become a bottleneck.
2. **Single master disk throughput and IOPS have their limits.** Even in AWS, you can't scale them infinitely, there are hard caps on both.
3. **Physical replication in PostgreSQL is single-threaded.** Which means that at some point, single core CPU utilization on replicas will become a bottleneck: the master will still happily cope with writes, but the replicas won't catch up, having 100% CPU utilization in WAL replay process.
4. **You can't upgrade PostgreSQL across major versions** (e.g. from v16 to v17) without stopping the entire cluster or using logical replication (which is slower and is hard to manage).

Microsharding (horizontal scaling) solves all of the above downsides. And it is an Ent Framework's built-in feature.

## Sharding

Sharding means that your table (including its structure, indexes etc.) exists on multiple PostgreSQL nodes (typically, on multiple master+replicas groups, which we call "islands" in Ent Framework). The data is split across the nodes though: no two islands share the same data.

* When you insert a new row, the engine first needs to decide, what will be the destination island. It may be a random selection, or a selection based on some heuristics (e.g. we may want all the data of a particular customer live on the same island).
* When you update or delete a row, you also first locate its island, and then route the update/delete request there.

## Microsharding

Microsharding is a practical approach to do sharding:

1. There are way more microshards in the cluster than islands or even physical nodes. For instance, in Ent Framework, each microshard is a PostgreSQL schema. Each schema (microshard) has identical tables structure, but the data in different microshards differ.
2. At logical level, island is a group of microshards. And at physical level, island is a set of master + replica nodes serving that group of microshards.
3. Microshards are typically small, so they can migrate from one island to another with no downtime. This allows to rebalance the load evenly, plus enables PostgreSQL upgrades across major releases with no downtime (i.e. you add new islands to the cluster and then tell the migration tool to evacuate the microshards from the old nodes).

In Ent Framework, the words "shard" and "microshard" mean the same thing, we will use them interchangeably.
