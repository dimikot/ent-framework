# Shard Affinity, Ent Colocation

When designing your Ent graph, it's important to think in advance, how will sharding strategy look like for those Ents: what microshard will be chosen once a new Ent is created.&#x20;

The strategy is defined by the reqired `shardAffinity` configuration property:

```typescript
export class EntTopic extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: ...,
      ...
    });
  }
}
```

You have 3 options described below.

## Global Shard: shardAffinity=GLOBAL\_SHARD

This is the simplest strategy possible: all new Ents created are just placed to "shard 0" (aka "global shard"). By doing this, you essentially disable sharding for the Ent.

Using the global shard works best for the Ents which have relatively low cardinality in the database (like workspaces, sometimes user accounts etc.). That Ent must also experience not too many writes (comparing to the number of reads), i.e. it should have no strict needs for horizontal scaling.

## Colocate With Parent: shardAffinity=\["parent1", "parent2", ...]

Another commonly used strategy is to place the newly created Ent to the same microshard as some of this Ent's parent have. By doing this, you tell Ent Framework that your child Ent is located "near" its parent (or parents).

E.g. we may want to put all comments of a particular topic to the same microshard as this topic has:

```typescript
const schema = new PgSchema(
  "comments",
  {
    id: { type: ID, ... },
    topic_id: { type: ID },
    ...,
  },
  []
);

export class EntComment extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: ["topic_id"],
      ...,
    });
  }
}

// Creates the comment in the microshard whose number
// is parsed out of topicID prefix.
await EntComment.insert(vc, { topic_id: topicID });
```

Sometimes Ents have nullable field edges. If you still want to use parent colocation in this case, you can provide multiple field names in `shardAffinity`: Ent Framework will try to infer the microshard number from them in order of appearance, from the first non-null field.

Since Ent Framework does batching of the calls by microshards, having more children Ents in the same microshard significantly improves performance when e.g. doing `select()` calls.

Also, if you have colocation based on some parent pointing field edge (foreign key), Ent Framework is able to infer the microshards to query:

```typescript
// The queries will be sent only to the microshards
// where topicID1, topicID2 etc. live.
const comments = await EntComment.select(
  vc,
  { topic_id: [topicID1, topicID2, ...] },
  100,
);
```

I.e. the main reason to use colocation is that you don't need to have inverses (cross-shard foreign keys) defined in the Ent to query, if the call arguments includes knowledge about the parent Ent IDs.

## Random Shard on Insert: shardAffinity=\[]

This strategy creates Ents in a randomly chosen microshard. It works best only for a small number of Ent classes, the ones that define "roots" of "colocation hierarchies" (like users).

The idea is that you may e.g. defined EntWorkspace as having `shardAffinity=[]`, so it will be created in a random shard. Then, all other Ents that are "children" to EntWorkspace (e.g. EntUser), may have `shardAffinity` pointing to the parent's field edge (like `workspace_id`). Consequently, other may be colocated to their own parents (e.g. EntTopic colocated to EntUser, and EntComment colocated to EntTopic). This way, all the data related to the same EntWorkspace will appear in the same microshard, and no inverses will be needed. (Of course, such approach only works for relatively small workspaces.)
