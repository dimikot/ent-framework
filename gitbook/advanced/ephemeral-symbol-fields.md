# Ephemeral (Symbol) Fields

Sometimes we want to pass auxiliary information into [triggers.md](../getting-started/triggers.md "mention"), but there is really no field in the Ent schema corresponding to it. We need some temporary place to put the data to, to let the trigger read it and run some additional logic (like another Ent creation or update).

At the same time, you may want that "temporary place" to be non-optional on inserts. I.e. if you create a new Ent in the database, that piece of information must be treated as required.

**Ephemeral fields** provide such kind of a storage.

As an example, let's consider that you want to store EntComment's message encrypted, and in a separate Ent named EntText, with the same ID as EntComment's ID (possibly in a separate DB cluster). You don't want to deal with EntText directly though, and you don't want to let the developer forget about EntText creation as well. You need to incapsulate the encryption logic in EntComment class completely and let the trigger do encryption work on insert/update.

```typescript
const $MESSAGE = Symbol("$MESSAGE");

const schemaComments = new PgSchema(
  "comments",
  {
    id: { type: ID, autoInsert: "nextval('comments_id_seq')" },
    topic_id: { type: ID },
    // This becomes a required and non-nullable ephemeral field.
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
            await EntText.upsertReturning(
              vc,
              { id: newOrOldRow.id, text },
            ); 
          }
        },
      ],
      afterDelete: [
        async (vc, { oldRow }) => {
          const text = await EntText.loadNullable(vc, oldRow.id);
          await text?.deleteOriginal();
        }
      ],
    });
  }
}
...
const comment = await EntComment.insertReturning(vc, {
  topic_id: "123",
  [$MESSAGE]: "Hello", // required property!
});
```

From Ent Framework's point of view, `$MESSAGE` is a regular field: you can provide a type for it in the schema and, if there is no `autoInsert` specified, the property will be required (non-optional). Also, `allowNull` plays its regular role here.

But since `$MESSAGE` is an ephemeral (symbol) field, it won't be stored in the database. The data is **only available in your triggers**. The analogy on why it won't be stored is simple:

* When you run `JSON.stringify(obj)`, it skips all of the symbol fields.
* By default, `Object.keys(obj)` also doesn't return symbol keys.

(The above is just an analogy and a convention of course.)

TypeScript doesn't let you forget passing `$MESSAGE` field: it will raise an error saying that `$MESSAGE` is a required property of the `insertReturning()` argument. Also, in your triggers, the type of `input[$MESSAGE]` will be `string` and not `string | undefined`, so you can assume that the value is always passed.
