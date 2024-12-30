# Sharding Low-Level API

In [locating-a-shard.md](locating-a-shard.md "mention") article we discussed, how Ent Framework automatically determines, which shard to use for a particular Ent, based on the Ent ID.

But there is also a lower level set of methods in `Cluster` class, for the cases when you want to manipulate the shards manually, or when you don't want to encode the shard number in an ID for some reason.

The API described below is exposed by `Cluster` class:

```typescript
export const cluster = new Cluster({
  islands: () => [ // <-- callback
    {
      no: 0,
      nodes: [
        { name: "abc-instance-1", host: "...", ... },
        { name: "abc-instance-2", host: "...", ... },
      ],
    },
    {
      no: 1,
      nodes: [
        { name: "abc-instance-3", host: "...", ... },
        { name: "abc-instance-4", host: "...", ... },
      ],
    },
  ],
  ...,
});
```

## cluster.shardByNo(): get a Shard by its Number

Allows you to get an instance of `Shard` class (representing a microshard) by its number:

```
const shard = cluster.shardByNo(42);
```

