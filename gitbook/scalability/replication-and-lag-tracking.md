# Replication and Lag Tracking

The crucial feature of Ent Framework, mainly defining its existence, is built-in support for replication (vertical scaling) and microsharding (horizontal scaling).

In this article, we'll talk about replication.

"Replication" means that you can write the data rows to one database machine, and then, after a short (but significant!) delay, can read the same data from one or more replica machines. PostgreSQL built-in replication ensures that everything written to the master DB will eventually appear in all of the replica DBs.

## Set up Replication in PostgreSQL

Ent Framework is just a client library, which means that you need to configure PostgreSQL replication before continuing.

You have 2 options here:

1. Use low-level tools like [repmgr](https://www.repmgr.org) or [Patroni](https://github.com/patroni/patroni) to connect your master DB with your replica DBs.

## Cluster Configuration
