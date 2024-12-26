# Replication and Automatic Lag Tracking

Replication (vertical scaling) and microsharding (horizontal scaling) are the two key features that define Ent Framework—without them, the library would lose its core purpose.

In this article, we’ll focus on replication.

“Replication” means you can write data to a single database machine and, after a short (but noticeable) delay, read the same data from one or more replica machines. PostgreSQL’s built-in replication ensures that all data written to the master database eventually appears on every replica.

## Terminology

Before we continue, let's agree on a common terminology.

* **Master and Replica**: you commit data to the master node, and it eventually appears on all replica nodes. Transactions are remained atomic: multiple rows committed in one transaction to the master also appear "simultaneously" at replicas.
* **Replication lag**: time passed between the moment the data is committed to the master and the moment when this data can be read from a replica. Each replica has its own replication lag, since they all replay transactions from the master independently.
* **Read-After-Write Consistency**: if you write data in some "context" and then can read it back immediately _in the same context_, the read-write API is called "read-after-write consistent". Of course, "write to master, read from replica" workflow is not read-after-write consistent (but "write to master, read from master" is). Despite that, Ent Framework's API _is_ read-after-write consistent (we'll discuss it in details below).
* **Eventual consistency**: you write data, and then _eventually_, after some delay (possibly large), you can read it back. "Write to master, read from replica" is an example of an eventually consistent workflow (which is not read-after-write consistent).
* **Write-Ahead Log (WAL)**: when you commit data to the master node, transactional databases (like PostgreSQL) first write it to a special "append-only" file called WAL. Once it's done, they save the rows to the database files. (In practice it's way more complicated, but for simplicity, we can stop on the simple definition.) WAL is also replayed on all replicas, so it's guaranteed that the replicas _eventually_ follow the master bit by bit.
* **Log Sequence Number (LSN)**: on master, a position in WAL after some transaction commit; on replica, a position in WAL up to which the replica has already replayed the commits from master. To check that a replica is "good enough" for reading the data previously written to the master, you can compare the replica's current LSN with the master's LSN after the write: if it's greater or equal, then you'll read the data back.

## Setting up Replication in PostgreSQL

Ent Framework is just a client library, which means that you need to configure PostgreSQL replication before we continue.

You have 2 options:

1. Use low-level tools like [repmgr](https://www.repmgr.org) or [Patroni](https://github.com/patroni/patroni) to connect your master DB with your replica DBs.
2. Pay more money and use a PaaS solution like [AWS RDS for PostgreSQL](https://aws.amazon.com/rds/postgresql/) or [AWS RDS Aurora](https://aws.amazon.com/rds/aurora/). They have replication set up out of the box.

## Replication Lag

OK, you have a master database where you write the data to, and you have replica databases where you read from. It's just that simple, right?

Not so fast.

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

This issue appears independently on the database engine you use, be it Aurora, RDS or vanilla PostgreSQL replication. The only difference between the engines is the average lag duration, but the lag always exists.

To solve the replication lag issue, there are 2 options:

1. Read from the master DB. The question is, how do we know, should we read from master or from replica at a particular moment.
2. Read from replica, but _if the data is not yet there_, wait a bit and retry. If there is no luck, fallback to master. The main question here is how do we understand that "the data is not there yet".

Addressing replication lag problem improperly can quickly turn your codebase into a boilerplate mess.

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
  ...,
});
```

Notice that we don't tell it, what endpoint is master and what endpoints are replicas: Ent Framework will detect it automatically.&#x20;

In fact, master and one of replicas may switch roles in real time (when you do some PostgreSQL maintenance, or when a master node fails, and you promote a replica to be the new master). Ent Framework handles such switches automatically and with no downtime.

### AWS RDS Writer and Reader Endpoints

If you use Amazon's RDS or Aurora, it provides you with 2 hostnames:

* **Writer** (master) endpoint. When there is an outage on the master node, RDS automatically promotes one of the replicas to be a new master, and changes the writer endpoint routing to point to the new master.
* **Reader** (random replica) endpoint. If there are multiple replicas in the cluster, RDS routes the connections to a "random" replica (i.e. it's unpredictable, to which one).

From the first glance, it looks like having just 2 endpoints is a pretty useful feature.

Unfortunately, it all falls apart when it comes to the replication lag tracking problem.

* **Writer endpoint switch latency**: if there is a master outage, then, even after the new master is promoted in the cluster, the writer endpoint switches to it not immediately: there is some artificial latency,
* **Reader endpoint routing is unpredictable**: often times, one replica can already be "in sync" with the master (relative to the current user; we'll talk about it a bit later), whilst another replica is not yet. The engine like Ent Framework needs to know exactly, which replica does it connect to, to properly track its replication lag and metrics.

So, when working with Ent Framework, it's highly **discouraged** to use the automatically routed reader and writer endpoints. Instead, you'd better tell the engine the exact list of nodes in the cluster, and let it decide the rest.

In Ent Framework, you can even modify the list of nodes in real time, without restarting the Node app. I.e. if you have a periodic timer loop that reads the up-to-date list of cluster nodes and returns it to Ent Framework, it will work straight away and with no downtime. Nodes may appear and disappear from the cluster, and the master may switch roles with replicas: Ent Framework will take care of it all and do the needed transparent retries.

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

## Automatic Replication Lag Tracking

Once you set up the `Cluster` instance, Ent Framework is able to automatically discover, which exact node is master and what nodes are replicas.

Imagine you run the following series of calls:

```typescript
await EntComment.insert(vc, { ... });
... // short delay (like 10 ms)
const comments = await EntComment.select(vc, {...}, 100); // <-- master or replica?
```

The 1st call will be executed against the master node, but will a replica be used for the 2nd call? No, it won't: the 2nd call will also run against the master node.  10 ms is a too short time interval for the replica to receive the update from master. If it was queried from a replica, we would not receive the just-inserted comment in the list of all comments returned by `select()` call.

Ent Framework knows that in should use the master for reading, because for the VC used, it remembers the LSN (write-ahead log position) after each write. For replicas, it also knows their LSNs, so before sending a query to some replica, Ent Framework compares the master LSN at the time of the last write **in this VC** with the LSN at the replica.

### Timelines, Einstein and Special Relativity

So, Ent Framework provides a "read-after-write consistency" guarantee within the context of the same VC's principal.

The context within which a read-after-write consistency is guaranteed is called a **Timeline**. Timeline is a special property of VC which remembers, what were LSNs on the master node after each write to each microshard+table. It's like a temporal state of the database related to the operations in a particular VC (basically, by a particular user).

Here is a physics analogy to help you better understand, what a timeline is: **frame of reference in special relativity.** It is well known that the order of 2 events happened in one frame of reference [is not necessarily the same ](https://en.wikipedia.org/wiki/Ladder_paradox)as the order of the same exact events in another frame of reference. E.g. events "light bulb A blinked" and "bulb B blinked" separated by 1 mln miles may happen at the same time in one frame of reference, or "first A then B" in another frame or reference, or "first B then A" in a 3rd frame of reference. The order is strictly defined only in case when the light (the fastest speed of signal propagation possible) is able to travel between A and B (then, it will be "first A then B"). I.e. some information needs to be passed from A to B, and only then we can tell for sure that "B happened after A" and not vice versa.

The same thing applies to timelines in Ent Framework: read-after-write consistency is only guaranteed within the same timeline. Also, one timeline can send a "signal" to another timeline propagating the knowledge about the change (which is called "causality"). After that signal is received, the read-after-write consistency will apply across those timelines.

### Propagating Timelines via Session

Consider the following pseudo-code:

```typescript
app.post("/comments", async (req, res) => {
  await EntComment.insert(req.vc, { ... });
  req.session.timelines = req.vc.serializeTimelines();
  return res.redirect("/comments");
});

app.get("/comments", async (req, res) => {
  req.vc.deserializeTimelines(req.sessdion.timelines);
  const comments = await EntComment.select(req.vc, {...}, 100);
  return res.render("comments.tpl", { comments });
});
```

The browser sends a `POST /comments`  request, so a new comment is inserted in the database, and the browser is immediately redirected to a `GET /comments`  endpoint. Since we serialize all VC's timelines in the POST endpoint ("1st frame of reference") and then deserialize them in the GET endpoint ("2nd frame of reference"), the second VC receives a "↯-signal" from the first VC, and it establishes a strong read-after-write consistency between them. Thus, the 2nd request will be served by the master node and read the recent data.

<figure><img src="../.gitbook/assets/image (13).png" alt="" width="563"><figcaption><p>The changes happened at "W" will be visible at "R"</p></figcaption></figure>

### Independent Timelines Use Case

Notice that the above way of timelines propagation (via session) only works in the context of a single user (single session), when we're able to send a "↯-signal" from the write event to the read event moments.

Now let's see what happens when we have two independent users, Alice and Bob.

1. Alice calls `POST /comments` and adds a comment to the master database.
2. Immediately "after" that, Bob calls `GET /comments` to see the list of comments.

<figure><img src="../.gitbook/assets/image (14).png" alt="" width="375"><figcaption><p>At "R", Bob will likely <strong>not</strong> see Alice's changes made at "W"</p></figcaption></figure>

Since the timelines of Bob are in another "frame of reference" than Alice's, and we did not send any signal from Alice to Bob, the request will likely be served from a replica node (not from the master), which means that Bob will likely see the old data.

The same way as there is no absolute sequentiality in special relativity, there is also no guarantee regarding read-after-write consistency between different timelines. And it is generally fine: we don't care whether Bob loaded the old or the new data. Even if he is lucky and got the new data, he could instead have had just a little higher network latency, or pressed Reload button a little earlier, so he could have seen the old data even in the case there was no replicas in the cluster at all, and all requests would have been served by the master node only.

### Propagating Timelines via a Pub-Sub Engine

There are still cases where we want one user to immediately see the data modified by another user, i.e. establish some cross-user read-after-write consistency.

If we think about it, we realize that it happens only in one use case: when a data modification made by Alice causes other users (Bob, Charlie etc.) to "unfreeze and re-render". I.e. we must already have a transport to propagate that "fanout-unfreeze" signal. So all we need is to just add a payload (with serialized timelines) as a piggy-back to this signal, and then, Bob, Charlie etc. will establish a read-after-write consistency with Alice's prior write.

```typescript
// Ran by Alice who adds a comment.
app.post("/:topic_id/comments", async (req, res) => {
  const topicID = req.params.topic_id;
  const commentID = await EntComment.insert(req.vc, { topic_id: topicID, ... });
  await pubSub.publish(topicID, {
    commentID,
    timelines: req.vc.serializeTimelines(),
  });
});

// Ran by each user (Bob, Charlie etc.) to receive updates related
// to a particular topic (rough pseudo-code).
wsServer.on("subscribe", (ws, message) => {
  return pubSub.subscribe(message.topicID, async (payload) => {
    ws.vc.deserializeTimelines(payload.timelines);
    const comments = await EntComment.select(
      ws.vc,
      { topic_id: message.topicID, ... }, 
      100,
    );
    ws.send(comments);
  });
});
```

<figure><img src="../.gitbook/assets/image (16).png" alt="" width="563"><figcaption><p>Bob and Charlie at "R" will see Alice's changes made at "W"</p></figcaption></figure>

VC's method `deserializeTimelines()` **merges** the received timelines signal into the current VC's timelines. You can call call it as many times as needed, when you receive a pub-sub signal.

### What Data is Stored In a Timeline

VC timelines are basically an array of the following structures:

* **shard**: microshard number where a write happened;
* **table**: the name of the table experienced a write in that microshard;
* **LSN**: a write-ahead log position after the above write;
* **expiration time**: a timestamp when the above information stops making sense, so Ent Framework can forget about it (typically, 60 seconds; defined in `maxReplicationLagMs` option of `PgClient`).

There is no magic here: to propagate the minimal read-after-write consistency signal, we must know, which table at which microshard experienced a write.

Notice one important thing: since there are no JOINs in Ent Framework, we read data from different microshards and track their timelines independently. That allows to assemble a read-after-write consistent snapshot from multiple microshards when reading.

