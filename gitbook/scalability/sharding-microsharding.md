# Sharding (Microsharding)

[replication-and-automatic-lag-tracking.md](replication-and-automatic-lag-tracking.md "mention") is not a silver bullet: you get fault tolerance and linear reads scaling, but there are limitations too:

1. **You can't scale writes.** Eventually, your single master will become a bottleneck.
2. **It's not easy to add more disk space to the database.** You have to shutdown a node, grow its volume and then sync the node back. If it's a master node, and you don't want downtime, then you have to switchover the master with one of replicas. Plus, there is in practice a limit on the total size of the database.
3. **You can't upgrade PostgreSQL across major versions** (e.g. from v16 to v17) without stopping the entire cluster or using logical replication (which is slower and is hard to manage).

Microsharding (horizontal scaling) solves all of the above downsides. And it is an Ent Framework's built-in feature.

## What is Sharding and Microsharding

Sharding means that your table (including its structure, indexes etc.) exists on multiple PostgreSQL nodes (typically, on multiple master+replicas groups, which we call "islands" in Ent Framework). The data is split across the nodes though: no two islands share the same data.

* When you insert a new row, the engine first needs to decide, what will be the destination island. It may be a random selection, or a selection based on some heuristics (e.g. we may want all the data of a particular customer live on the same island).
* When you update or delete a row, you also first locate its island, and then route the update/delete request there.

Microsharding is a practical approach to do sharding:

1. There are way more microshards in the cluster than islands or even physical nodes. For instance, in Ent Framework, each microshard is a PostgreSQL schema. Each schema (microshard) has identical tables structure, but the data in different microshards differ.
2. At logical level, island is a group of microshards. And at physical level, island is a set of master + replica nodes serving that group of microshards.
3. Microshards are typically small, so they can migrate from one island to another with no downtime. This allows to rebalance the load evenly, plus enables PostgreSQL upgrades across major releases with no downtime (i.e. you add new islands to the cluster and then tell the migration tool to evacuate the microshards from the old nodes).

In Ent Framework, the words "shard" and "microshard" mean the same thing, we will use them interchangeably.

## Terminology

Before we continue, let's agree on terminology.

### Node

We use the word "node" to mean "a PostgreSQL running on some machine, available in the network via a separate host:port pair". It may be a physical computer, a virtual machine, an AWS instance, an AWS RDS or Aurora PostgreSQL instance,

### Island

**Island** is a group of PostgreSQL nodes (machines): 1 master and N replicas. Each node on some island effectively holds the same set of data as all other nodes on that island. Data replication across the nodes may be done using the standard PostgreSQL physical replication mechanisms:

* managed by [repmgr](https://www.repmgr.org/) or other high level tools to introduce failover/switchover (in PostgreSQL terminology, "island" is sometimes referred to as "replication cluster");
* or managed by AWS RDS/Aurora (in RDS terminology, "island" is called "database").

### Microshard (Shard)

Microshard is a minimal unit of data rebalancing. Each shard is a PG schema, example naming: `sh0001`, `sh4242`, `sh0000`. Typically, there are multiple microshards (say, \~50) on each PostgreSQL island, and microshards are randomly distributed across islands (uniformly by the total size).&#x20;

* Once some data rows are written to a Microshard, those data rows never move to another Microshard. I.e. Microshard is first determined at row creation time and then never changes.
* Microshards can be moved as a whole from one Island to another without downtime. Since each Microshard is small, it's a fast process.
* One can allocate more Microshards with no downtime (e.g. if we have 300 already, we can add 200 more distributed across the existing Islands uniformly, and the newly created objects will start being put there too).
* There can be up to 1000 Microshards (the limit is arbitrary though).
* A Microshard PG schema can be inactive or active. If it's inactive, it is in the process of allocation, or it has just been moved from one Island to another (the schema got activated on the new Island and got inactivated on an old Island).

**Global Microshard, or Shard 0**: typically, there is a "special" global shard, which lives on a separate (bigger) **Island 0**. Tables in Shard 0 do not exist in other Microshards and have a low number of rows with low write and high read volume (e.g. user accounts, workspace metadata etc.).**Cluster** (or Region) is a set of Islands used by the same regional app. E.g. there can be a EU Cluster which consists of 4 Islands, and each Island has 1 master and 2 replica PG machines: 4\*(1+2) = 12 PG machines. New Island can be added to the Cluster, or existing Island can be removed from the Cluster (after all Microshards are moved out of it).It's important to understand that there are 2 points of view on a Cluster:

* Physical: Cluster is a set of Islands (doesn't matter which Microshards are on each Island).
* Logical: Cluster is a set of Microshards (doesn't matter on which exact Islands they live).

**Physical Table** is a regular PG table living on some PG machine of an Island in some Microshard. A Table can be "sharded" (Logical Table or just Table): in this case, there are effectively M tables in M Microshards, all having the same DDL structure. There is a framework which ensures that all those M tables have the same schema.

**Discovery workflow** in the framework determines, which Island each Microshard is located on. It happens at run-time, automatically. If a Microshard has just been moved to another Island, then the framework picks up this information immediately (with retries if needed).

**Microshards Rebalancing** calculates, what would be an optimal distribution of Microshards across Islands (based on Microshard sizes), and then performs a set of moves, in a controlled parallel way.

* Rebalancing needs to run when adding a new Island to a Cluster, to evenly distribute the empty Microshards among Islands. It's a manually initiated process.
* Rebalancing is used to major-upgrade PG version: first, all Microshards are moved away from an Island, then the empty Island gets re-created from scratch, and then Microshards are rebalanced back.

