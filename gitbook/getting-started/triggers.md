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
  },
],
...
await EntTopic.insertReturning(vc, {
  creator_id: "123",
  subject: "My Topic",
});  
```

Here, we automatically assign the value to `slug` field of the inserted row based on the topic's subject.

Notice that it requires a little quirk though: `slug` field in the schema needs to be defined with `autoInsert` attribute, otherwise Ent Framework TypeScript typing will make `slug` as a required property in \``insertReturning()` call.

As everything in Ent Framework, all arguments of the trigger functions are strongly typed.

* It will respect the field types defined in the schema exactly.
* Nullability is respected (fields defined with `allowNull: true` will be nullable in the `input` argument).
* It will pay attention to required and optional fields (the optional fields are the ones defined with `autoInsert` or `autoUpdate`).

### Accessing Ent ID in beforeInsert Trigger

Despite the insert operation has not yet been applied to the database, in all `beforeInsert` triggers, you can already read the ID of the Ent to be inserted. This is very convenient to organize eventual consistency logic in your code: in Ent Framework, there are no transactions exposed (and there can be no transactions even in theory when working across microshards or across different storage services), so you must pay attention to the order of the writes, to make sure your don't lose eventual consistency behavior:

```
...
beforeInsert: [
  async (vc, { input }) => {
    await addToKafka(this.name, input.id);
  },
],
...
```

Here we assume that you have a `addToKafka()` function which accepts the Ent class name and the Ent ID. After the write to Kafka succeeds, you proceed with saving the Ent to the database.

### beforeUpdate Triggers

Update is a more complicated operation, since you have the old row and the new row versions at the same time.

```typescript
...
beforeUpdate: [
  async (vc, { oldRow, input, newRow }) => {
    if (newRow.subject !== oldRow.subject) {
      let slug = slugufy(input.subject);
      if (await EntTopic.exists(vc, { slug })) {
        slug += `-${Date.now()}`;
      }
      input.slug = slug;
    }
  },
],
...
await topic.updateReturningX({ subject: "Hello" });
```

Notice that the code here is very similar to the `beforeInsert` trigger we discussed above. To avoid boilerplate in such cases, you can use `beforeMutation` instead; we'll describe it a little later.

In the trigger functions, Ent Framework gives you the following arguments:

* `oldRow`: the row with Ent fields right before the update. This object is immutable.
* `input`: properties passed to `update*()` method as they are. Notice that it includes **not** all Ent fields, but only the fields you are mutating. You need to  modify this object if you want the trigger to make changes in the Ent before the update happens.
* `newRow`: the result of applying `input` over `oldRow` . This is an immutable object.

### beforeDelete Triggers

This kind of triggers is the simplest:

```
...
beforeUpdate: [
  async (vc, { oldRow, input, newRow }) => {
    if (newRow.subject !== oldRow.subject) {
      let slug = slugufy(input.subject);
      if (await EntTopic.exists(vc, { slug })) {
        slug += `-${Date.now()}`;
      }
      input.slug = slug;
    }
  },
],
...
await topic.updateReturningX({ subject: "Hello" });
```
