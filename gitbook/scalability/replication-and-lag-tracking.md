# Replication and Lag Tracking

The crucial feature of Ent Framework, mainly defining its existence, is built-in support for replication (vertical scaling) and microsharding (horizontal scaling).

In this article, we'll talk about replication.

"Replication" means that you can write the data rows to one database machine, and then, after a short (but significant!) delay, can read the same data from one or more replica machines. PostgreSQL built-in replication ensures that everything written to the master DB will eventually appear in all of the replica DBs.

## Set up Replication in PostgreSQL

Ent Framework is just a client library, which means that you need to configure PostgreSQL replication before continuing.

You have 2 options here:

1. Use low-level tools like [repmgr](https://www.repmgr.org) or [Patroni](https://github.com/patroni/patroni) to connect your master DB with your replica DBs.
2. Pay some more money and use a PaaS solution like AWS RDS or AWS Aurora. They have replication set up out of the box.

## Replication Lag

OK, you have a master database where you write to, and you have replica databases where you read from. Right?

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
2. Read from replica, but if the data is not yet there, wait a bit and retry. If no luch, fallback to master. The main question here is how do we understand that "the data is not there yet".

Overall, addressing replication lag in the code improperly can quickly turn it into a spaghetti mess.

Luckily, Ent Framework takes care of this all automatically. In most of the cases, you don't need to think about the replication lag at all: the engine will choose, should it read from master or from replicas, transparently for your code.

## Cluster Configuration
