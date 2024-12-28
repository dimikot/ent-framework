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

In Ent Framework, "island" is a group of PostgreSQL nodes (machines): 1 master and N replicas. Each node on some island effectively holds the same set of data as all other nodes on that island. Data replication across the nodes may be done using the standard PostgreSQL physical replication mechanisms:

* managed by [repmgr](https://www.repmgr.org/) or other high level tools, to introduce failover/switchover;
* or managed by AWS RDS/Aurora (in RDS terminology, "island" is called "database").

Every vendor uses different words to name what we call "island" here:

* in PostgreSQL documentation, there is no common term; the closest one is probably "replication cluster"
* in AWS RDS and Aurora, they call it "database"
* in AWS Elasticsearch or OpenSearch services, they call it "domain"
* in AWD Elasticache Redis, they call it "cluster"

The name "island" is a common way to refer all of the above, plus we emphasize the logical nature of the island and that microshards can be migrated from one island to another, the same way as people sail in between them.

### Microshard (Shard)

Microshard is a minimal unit of data rebalancing. Each shard is a PostgreSQL schema, example naming: `sh0001`, `sh4242`, `sh0000`. Typically, there are multiple microshards (say, \~50) on each island, and microshards are randomly distributed across islands (uniformly by the total size).&#x20;

* Once some data rows are written to a microshard, those data rows never move to another microshard. I.e. microshard is first determined at row creation time and then never changes.
* Microshards can be moved **as a whole** from one island to another without downtime. Since each microshard is small, it's a fast process.
* One can allocate more microshards with no downtime (e.g. if we have 300 already, we can add 200 more and distribute them across the existing islands uniformly, so the newly created objects will start being put there too).
* There can be up to 10000 microshards (the limit is arbitrary though, you can make it larger if needed). Basically, the maximum number of microshards is determined by the PostgreSQL schemas naming conventions: e.g. `sh1235` or `sh0012` means that there may only be up to 10000 microshards.
* A microshard schema in PostgreSQL can be **inactive** or **active**. If it's inactive, it is in the process of allocation, or it has just been moved from one island to another (the schema got activated on the new island and got inactivated on an old island).

### **Global Microshard, Shard 0**

Typically, there is a "special" global microshard, which lives on a separate (with more CPU and more replicas) **island 0**. Tables in shard 0 do not exist in other microshards and have a low number of rows with low write and high read volume (e.g. user accounts, workspace metadata etc.).

This setup is not mandatory though: it's perfectly fine to have the global microshard located on an island with other microshards; it's just a matter of load balancing.

### **Cluster**

Cluster is a set of islands used by the same app. E.g. there can be a European cluster which consists of 4 islands, and each island has 1 master and 2 replica nodes: 4\*(1+2) = 12 PostgreSQL machines. New island can be added to the cluster, or existing island can be removed from the cluster (after all microshards are moved out of it).

It's important to understand that there are 2 points of view on a cluster:

* **Physical:** cluster is a set of islands (doesn't matter which microshards are on each island).
* **Logical:** cluster is a set of microshards (doesn't matter which exact islands they live on).

{% hint style="info" %}
Notice that in PostgreSQL documentation, "cluster" means a smaller thing (a PostgreSQL installation on a particular machine, what we call "node' above). Even "replication cluster" is smaller there (a group of master + replica nodes, wha we call "island"). In Ent Framework, "cluster" is a more overall concept: "group of islands" and "group of shards".
{% endhint %}

### **Physical Table**

Physical table a regular PostgreSQL table living on some node of an island in some microshard. A table can be "sharded" ("logical table" or just "table"): in this case, there are effectively M physical tables in M microshards, all having the same DDL structure. To ensure that all those M tables have the same schema, a database migration tool (such as pg-mig) needs to be used.

### **Discovery Workflow**

In Ent Framework, the engine needs to determine, which island each microshard is located on. This process is called "shards discovery". It happens at run-time, automatically. If a microshard has just been moved to another island, then the framework picks up this information immediately (with retries if needed).

Another kind of workflow is "master-replica discovery": master node of some island may fail at any time, and in this case, one of the replicas will be promoted to become the new master. Although the failover and replica promotion is not a part of Ent Framework (it's a feature of the replication toolset, like repmgr or AWS RDS), Ent Framework needs to react on the promotion promptly and with no downtime.

### **Microshards Rebalancing**

During the reblancing, the tool determines, what would be an optimal distribution of microshards across islands (based on microshard sizes), and then performs a set of moves, in a controlled parallel way.

* Rebalancing needs to run when you add a new island to the cluster, to evenly distribute the empty microshards among islands.
* Rebalancing is used to upgrade between the major PostgreSQL versions. First, all microshards are moved away from an island, then the empty island gets re-created from scratch, and then microshards are rebalanced back.

Although shards rebalancing is not a part of Ent Framework (you can use e.g. pg-microsharding library), the engine still needs to be aware of a temporary "blip" which appears when a shard is deactivated on an old island, but is not yet activated on a new one.

