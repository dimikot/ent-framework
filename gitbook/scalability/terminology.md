# Terminology

Naming things is [one of two hardest problems in computer science](https://martinfowler.com/bliki/TwoHardThings.html), so before we continue, let's agree on terminology.

## Node

We use the word "node" to mean "a dabase server running on some machine, available in the network via a separate host:port pair". It may be a physical computer, a virtual machine, an AWS instance, an AWS RDS or Aurora PostgreSQL instance.

## Island

In Ent Framework, "island" is a group of nodes (machines): 1 master and N replicas (where N may be zero). Each node on some island effectively holds the same set of data as all other nodes on that island. Data replication across the nodes may be done using the standard database physical replication mechanisms:

* managed by [repmgr](https://www.repmgr.org/) or other high level tools, to introduce failover/switchover;
* managed by AWS RDS/Aurora (in RDS terminology, "island" is called "database");
* ...

Every vendor uses different words to name what we call "island" here:

* in PostgreSQL documentation, there is no common term; the closest one is probably "replication cluster"
* in AWS RDS and Aurora, they call it "database"
* in AWS Elasticsearch or OpenSearch services, it is "domain"
* in AWD Elasticache Redis, they call it "cluster"

The name "island" is a common way to refer any of the above concepts. We also emphasize the logical nature of the island and that microshards can be migrated from one island to another (the same way as people sail between islands in the ocean).

## Microshard (Shard)

Microshard is a minimal unit of data rebalancing. Each shard is a PostgreSQL schema, example naming: `sh0001`, `sh4242`, `sh0000`. Typically, there are multiple microshards (say, \~50) on each island, and microshards are randomly distributed across islands (uniformly by the total size).&#x20;

* Once some data rows are written to a microshard, those data rows never move to another microshard. I.e. microshard is first determined at row creation time and then never changes. (This denotes a small flavor difference between "microshard" and "shard" terms: typically, rows are allowed to change their "macro shard", but are always nailed down to their microshards.)
* Microshards can be moved **as a whole** from one island to another without downtime. Since each microshard is small, it's a fast and granulaer process.
* One can allocate more microshards with no downtime. E.g. if we have 300 already, we can add 200 more and distribute them across the existing islands uniformly, so the newly created objects will start being put there too. You can't delete microshards once they are allocated though, because otherwise you'll lose the data.
* There can be up to 10000 microshards (the limit is arbitrary, you can make it larger if needed). The maximum number of microshards is determined by the PostgreSQL schemas naming convention: e.g. `sh1235` or `sh0012` names mean that there may only be up to 10000 microshards.
* A microshard schema in the database can be **inactive** or **active**. If it's inactive, it is in the process of allocation, or it has just been moved from one island to another. The schema gets "activated" on the new island and gets inactivated on an old island.

## **Cluster**

Cluster is a set of islands used by the same app. E.g. there can be a cluster which consists of 2 islands, and each island has 1 master and 2 replica nodes: 2\*(1+2) = 6 PostgreSQL machines. New island can be added to the cluster, or existing island can be removed from the cluster (after all microshards are moved out of it).

<div data-full-width="false"><figure><img src="../.gitbook/assets/svg (3).svg" alt=""><figcaption></figcaption></figure></div>

It's important to understand that there are 2 points of view on a cluster:

* **Physical:** cluster is a set of islands (it doesn't matter, which microshards are on each island).
* **Logical:** cluster is a set of microshards (it doesn't matter, which islands the microshards live on).

{% hint style="info" %}
Notice that in PostgreSQL documentation, "cluster" means a smaller thing (a PostgreSQL installation on a particular machine, what we call "node" above). Even "replication cluster" is smaller there (a group of master + replica nodes, what we call "island"). In Ent Framework, "cluster" is a more overall concept: "group of islands" and "group of shards".
{% endhint %}

## **Global Microshard, Shard 0**

Typically, there is a "special" global microshard, which lives on a separate (with more CPU and more replicas) **island 0**. Tables in shard 0 do not exist in other microshards and have a low number of rows with rare writes and frequent reads (e.g. organizations, workspace metadata etc.).

<div data-full-width="false"><figure><img src="../.gitbook/assets/svg (4).svg" alt=""><figcaption></figcaption></figure></div>

This setup is not mandatory though: it's perfectly fine to have the global microshard 0 located on an island together with other microshards; it's just a matter of load balancing.

## **Logical and Physical Tables**

Imagine our cluster has 3 "logical tables": `users`, `topics` and `comments` .

A logical table (e.g. `users`) can be "sharded": in this case, there are effectively M physical tables in M microshards, all having the same DDL structure. Thus, physical table is a regular PostgreSQL table living on some master+replicas of an island in some microshard.&#x20;

To ensure that all M physical tables for the same logical table have the identical schema, a database migration tool (such as pg-mig) needs to be used; that is beyond the scope of Ent Framework, but the tools work in tandem.

<figure><img src="../.gitbook/assets/svg (5).svg" alt=""><figcaption></figcaption></figure>

On the picture, there are 3 logical tables (`users`, `topics` and `comments`). The corresponding physical tables live on 4 microshards, and the microshards live on 2 islands. E.g. logical table `users` is represented by 4 physical tables `users` in 4 microshards. Since microshards lives on some island, and island consists of master and replica nodes, there are essentially replicas for every physical table in the cluster.

## **Discovery Workflow**

In Ent Framework, the engine needs to determine, which island each microshard is located on. This process is called "shards discovery". It happens at run-time, automatically. If a microshard has just been moved to another island, then the framework picks up this information immediately (with retries if needed).

Another kind of workflow is "master-replica discovery". Master node of some island may fail at any time, and in this case, one of the replicas will be promoted to become the new master. Although the failover and replica promotion is not a part of Ent Framework (it's a feature of the replication toolset, like repmgr or AWS RDS), Ent Framework needs to react on the promotion promptly and with no downtime.

## **Microshards Rebalancing**

During the reblancing, the tool (such as pg-microsharding) determines, what would be an optimal distribution of microshards across islands (based on microshard sizes), and then performs a set of moves, in a controlled parallel way.

* Rebalancing needs to run when you add a new island to the cluster, to evenly distribute microshards among islands.
* Rebalancing is used to upgrade between the major PostgreSQL versions. First, all microshards are moved away from an island, then an empty island gets re-created from scratch, and then microshards are rebalanced back. (Or both of the above processes run in parallel.)

Although shards rebalancing is not a part of Ent Framework (you can use e.g. pg-microsharding tool), the engine still needs to be aware of a temporary "blip" which appears when a shard is deactivated on an old island, but is not yet activated on a new one.
