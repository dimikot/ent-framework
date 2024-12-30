# Sharding Low-Level API

In [locating-a-shard.md](locating-a-shard.md "mention") article we discussed, how Ent Framework automatically determines, which shard to use for a particular Ent, based on the Ent ID.

But there is also a lower level set of methods in `Cluster` class, for the cases when you want to manipulate the shards manually, or when you don't want to encode the shard number in an ID for some reason.

