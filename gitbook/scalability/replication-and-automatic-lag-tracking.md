# Replication and Automatic Lag Tracking

The crucial feature of Ent Framework, mainly defining its existence, is built-in support for replication (vertical scaling) and microsharding (horizontal scaling).

In this article, we'll talk about replication.

"Replication" means that you can write the data rows to one database machine, and then, after a short (but significant!) delay, can read the same data from one or more replica machines. PostgreSQL built-in replication ensures that everything written to the master DB will eventually appear in all of the replica DBs.

## Terminology

Before we continue, let's agree on some common terminology.

* **Master and Replica**: you probabl know what's that already. You commit data to the master node, and it eventually appears on all replica nodes.
* **Replication lag**: time passed between the moment the data is committed to the master and the moment when this data can be read from a replica. Each replica has its own replication lag, since they all replay transactions from the master independently.
* **Read-After-Write Consistency**: if you write something in some context and then can read it back immediately in the same context, such API is called "read-after-write consistent". Of course, "write to master, read from replica" workflow is not read-after-write consistent (but "write to master, read from master" is). At the same time, Ent Framework API _is_ read-after-write consistent (we'll discuss it in details below).
* **Eventual consistency**: you write something, and then _eventually_, after some delay (possibly large), you can read it back. "Write to master, read from replica" is an example of an eventually consistent workflow (which is not read-after-write consistent).
* **Write-Ahead Log (WAL)**: when you commit some data to the master node, transactional databases (like PostgreSQL) first write it to a special "append-only" place called WAL. Once it's done, they save the rows to the database files. (In practice it's way more complicated than that, but for simplicity, we can stop on the simple definition.) WAL is also replayed on all replicas, so it's guaranteed that the replicas follow the master.
* **Log Sequence Number (LSN)**: on master, a position in WAL after some transaction commit; on replica, a position in WAL up to which the replica has already replayed the commits from master.
* **Timeline**: in Ent Framework, it's a special property of VC which remembers, what were LSNs on the master node after each write to each microshard/table. It's like a temporal state of the database related to the operations in a particular VC (basically, by a particular user).

## Set up Replication in PostgreSQL

Ent Framework is just a client library, which means that you need to configure PostgreSQL replication before continuing.

You have 2 options here:

1. Use low-level tools like [repmgr](https://www.repmgr.org) or [Patroni](https://github.com/patroni/patroni) to connect your master DB with your replica DBs.
2. Pay more money and use a PaaS solution like [AWS RDS for PostgreSQL](https://aws.amazon.com/rds/postgresql/) or [AWS RDS Aurora](https://aws.amazon.com/rds/aurora/). They have replication set up out of the box.

## Replication Lag

OK, you have a master database where you write the data to, and you have replica databases where you read from. It's just that simple, right?

Wrong.

Consider the following code:

```typescript
await query(MASTER, "INSERT INTO comments(text) VALUES('Hello')");
return res.redirect("/comments");
```

And on your `/comments` page:

```typescript
const comments = await query(REPLICA, "SELECT * FROM comments");
return res.render("comments.tpl", { comments });
```

Unfortunately, you won't see the just-added comment on that rendered page, because there is a **replication lag issue**: the data written to a `MASTER` DB doesn't appear on the `REPLICA` DB immediately, there is 10-500 ms latency (and sometimes more, it depends on the database load, network stability etc.).

This issue appears independently on the database engine you use, be it Aurora, RDS or vanilla PostgreSQL replication. The only difference between them is the average lag length, but the lag always exists.

To solve the replication lag issue, there are 2 options:

1. Read from the master DB. The question is, how do we know, should we read from master or from replica, and for how long.
2. Read from replica, but _if the data is not yet there_, wait a bit and retry. If no luch, fallback to master. The main question here is how do we understand that "the data is not there yet".

Overall, addressing replication lag improperly can quickly turn your codebase into a boilerplate mess.

Luckily, Ent Framework takes care of this all automatically. In most of the cases, you don't need to think about the replication lag at all: the engine will choose, should it read from master or from replicas, transparently for your code.

## Cluster Configuration

First, you need to tell Ent Framework, where can it find the master database and all replicas:

```typescript
export const cluster = new Cluster({
  islands: () => [
    {
      no: 0,
      nodes: [
        { name: "pg-001a", host: "pg-001a.your-domain.com", ... },
        { name: "pg-001b", host: "pg-001b.your-domain.com", ... },
        { name: "pg-001c", host: "pg-001c.your-domain.com", ... },
      ],
    },
  ],
  createClient: ({ name, ...config }) => new PgClientPool({ name, config }),
  loggers: {
    clientQueryLogger: (props) => console.debug(props),
    swallowedErrorLogger: (props) => console.log(props),
  },
});
```

Notice that we don't tell it, which endpoint is master and what endpoints are replicas: Ent Framework will detect it automatically.&#x20;

In fact, master and one of replicas may switch roles in real time (when you do some PostgreSQL maintenance, or when a master node fails, and you promote a replica to be the new master). Ent Framework handles such switches automatically and with no downtime.

### AWS RDS Writer and Reader Endpoints

If you use Amazon's RDS or Aurora, it provides you with 2 hostnames:

* **Writer** (master) endpoint. When there is an outage on the master node, RDS automatically promotes one of the replicas to be a new master, and changes the writer endpoint routing to point to the new master.
* **Reader** (random replica) endpoint. If there are multiple replicas in the cluster, RDS routes the connections to a "random" replica (i.e. it's unpredictable, to which one).

From the first glance, it looks like both are pretty useful features.

But it's only the first glance, and it all falls apart when it comes to the replication lag tracking problem.

* **Writer endpoint switch latency**: If there is a master outage, then, even after the new master is promoted in the cluster, the writer endpoint switches to it not immediately: there is some artificial latency,
* **Reader endpoint routing is unpredictable**: often times, one replica is already "in sync" with the master (relative to the current user; we'll talk about it a bit later), whilst another replica is not yet. The engine like Ent Framework needs to know exactly, which replica does it connect to, to properly track its replication lag and metrics.

So, when working with Ent Framework, it's highly discouraged to use the automatically routed reader and writer endpoints. Instead, you'd better tell the engine the exact list of nodes in the cluster, and let it decide the rest.

Luckily, in Ent Framework, you can even modify the list of nodes in real time, without restarting the Node app. I.e. if you have a periodic timer loop that reads the up-to-date list of cluster nodes and returns it to Ent Framework, it will work straight away and with no downtime. Nodes may appear and disappear from the cluster, and master may switch roles with replicas: Ent Framework will take care of it all and to the needed transparent retries.

This is why in `Cluster` configuration, the list of islands (nodes) is returned by a callback. You can tell this callback to return a different list once the cluster layout changes:

```typescript
export const cluster = new Cluster({
  islands: () => [ // <-- callback
    {
      no: 0,
      nodes: [
        {
          name: "abc-instance-1",
          host: "abc-instance-1.abcd.us-west-2.rds.amazonaws.com",
          ...,
        },
        {
          name: "abc-instance-3",
          host: "abc-instance-2.efgh.us-west-2.rds.amazonaws.com",
          ...,
        },
      ],
    },
  ],
  ...,
});
```

## WAL, LSN, Timeline and Automatic Lag Tracking

Once you set up the `Cluster` instance, Ent Framework is able to automatically discover, which exact node is master and what nodes are replicas.

Imagine you run the following series of calls:

```typescript
await EntTopic.insert(vc, { ... });
... // short delay (like 10 ms)
const topics = await EntTopic.select(vc, {...}, 100); // <-- master or replica?
```

The 1st call will be executed against the master node, but will a replica be used for the 2nd call? No, it won't: the 2nd call will also run against the master node.  10 ms is a too short time interval for the replica to receive the update from master, is if it was queried there, we would not receive the just-inserted topic in the list of all topics returned by `select()` call.

Ent Framework knows the it should run a call against the master node, because for the VC used, it remembers the "Write-Ahead Log position" after each write. For replicas, it also knows their WAL position, so before sending a query to some replica, Ent Framework compares the position on master at the time of the last write **in this VC** with the position at the replica.

