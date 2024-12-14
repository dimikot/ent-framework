# Ephemeral (Symbol) Fields

Sometimes we need to pass some auxiliary information into  a trigger, but there is really no field in the Ent schema corresponding to it. We need some temporararily place to put the data to, to let the trigger read it and do some additional action (like another Ent creation or update).

Ephemeral fields provide such kind of a storage.

```typescript
const schema = new PgSchema(
  "comments",
  {
    id: { type: ID, autoInsert: "nextval('comments_id_seq')" },
    created_at: { type: Date, autoInsert: "now()" },
    topic_id: { type: ID },
    creator_id: { type: ID },
    message: { type: String },
  },
  []
);

export class EntComment extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: ["topic_id"],
      privacyInferPrincipal: async (_vc, row) => row.creator_id,
      privacyLoad: [
        new AllowIf(new CanReadOutgoingEdge("topic_id", EntTopic)),
        new AllowIf(new OutgoingEdgePointsToVC("creator_id")),
      ],
      privacyInsert: [new Require(new OutgoingEdgePointsToVC("creator_id"))],
    });
  }
}
```

