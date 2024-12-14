# Ephemeral (Symbol) Fields

Sometimes we need to pass some auxiliary information into  a trigger, but there is really no field in the Ent schema corresponding to it. We need some temporararily place to put the data to, to let the trigger read it and do some additional action (like another Ent creation or update).

Ephemeral fields provide such kind of a storage.

As an example, let's consider that we want to make the EntComment's message to be stored encrypted, and in a separate Ent named EntText with the same ID as EntComment's ID (possibly stored in a separate DB cluster). But at the same time, we don't want to deal with EntCommentText directly: we want to incapsulate the encryption logic in EntComment class completely and let the trigger do encryption work on insert/update.

```typescript
const $MESSAGE = Symbol("$MESSAGE");

const schemaComments = new PgSchema(
  "comments",
  {
    id: { type: ID, autoInsert: "nextval('comments_id_seq')" },
    topic_id: { type: ID },
    [$MESSAGE]: { type: String },
  },
  []
);

export class EntComment extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      ...
      beforeMutation: [
        async (vc, { op, newOrOldRow }) => {
          if (op !== "DELETE") {
            const text = await encrypt(newOrOldRow[$MESSAGE]);
            await EntCommentText.upsertReturning(
              vc,
              { id: newOrOldRow.id, text }
            ); 
          }
        },
      ],
      afterDelete: [
        async (vc, { oldRow }) => {
          const text = EntText.loadNullable(vc, oldRow.id);
          await text?.deleteOriginal();
        }
      ],
    });
  }
}
```

