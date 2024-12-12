# Triggers

Triggers are hooks which Ent Framework execute right before or after a mutation (insert, update or delete).

The word "hook" also draws the analogy with React Hooks (from frontend world), since update-triggers in Ent Framework have several traits in common with React's `useEffect()` hook.

## Before-triggers

Triggers are defined in the Ent Class configuration, near [privacy rules](privacy-rules.md).

In before-triggers, you can:

1. Make changes in the fields right before they are saved to the database.
2. Load or even mutate other Ents.

```typescript
const schema = new PgSchema(
  "topics",
  {
    id: { type: ID, autoInsert: "nextval('topics_id_seq')" },
    created_at: { type: Date, autoInsert: "now()" },
    updated_at: { type: Date, autoUpdate: "now()" },
    slug: { type: String, autoInsert: "NULL" },
    creator_id: { type: ID },
    subject: { type: String, allowNull: true },
  },
  ["slug"]
);

export class EntTopic extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      ...
      beforeInsert: [...],
      beforeUpdate: [...],
      beforeDelete: [...],
    });
  }
}
```

### beforeInsert Triggers

Let's start with an example:

```typescript
...
beforeInsert: [
  async (vc, { input }) => {
    let slug = slugufy(input.subject);
    if (await EntTopic.exists(vc, { slug })) {
      slug += `-${Date.now()}`;
    }
    input.slug = slug;
  }
]
...
await EntTopic.insertReturning(vc, {
  creator_id: "123",
  subject: "My Topic",
});  
```

Here, we automatically write the value to `slug` field of the Ent based on the topic's subject.
