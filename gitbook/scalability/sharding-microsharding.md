# Sharding (Microsharding)

[replication-and-automatic-lag-tracking.md](replication-and-automatic-lag-tracking.md "mention") is not silver bullet: you get fault tolerance and linear reads scaling, but there are limitations too:

1. You can't scale writes. Eventually, your single master will become a bottleneck.
2. You can't easily add more disk space to the database: to do so, you have to shutdown a node, grow its volume and then sync the node back. If it's a master node, and you don't want downtime, then you have to switchover the master with one of replicas.
3. And the main downside: you can't upgrade PostgreSQL across major versions (e.g. from v16 to v17) without stopping the entire cluster or using logical replication (which is slower and is hard to manage).

Microsharding (horizontal scaling) solves all of the above downsides.
