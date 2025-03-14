# Triggers

Triggers are hooks which Ent Framework execute right before or after a mutation (insert, update or delete).

The word "hook" also draws the analogy with React Hooks (from frontend world), since update-triggers in Ent Framework have several traits in common with React's `useEffect()` hook.

Triggers are defined in the Ent Class configuration, near [privacy-rules.md](privacy-rules.md "mention").

## Before-Triggers

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
      beforeMutation: [...],
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
const topic = await EntTopic.insertReturning(vc, {
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

Despite the insert operation has not yet been applied to the database, in all `beforeInsert` triggers, you can already read the ID of the Ent to be inserted.

This is very convenient to organize eventually consist logic in your code: in Ent Framework, there are no transactions exposed (and there can be no transactions even in theory when working across microshards or across different storage services), so you must pay attention to the order of the writes, to make sure your don't lose eventual consistency behavior:

```typescript
...
beforeInsert: [
  async (vc, { input }) => {
    await addToKafka(this.name, input.id);
  },
],
...
```

Here we assume that you have a `addToKafka()` function which accepts the Ent class name and the Ent ID. After the write to Kafka succeeds, you proceed with saving the Ent to the database. Using this apprpach, you can e.g. implement eventually-consistent pipelining of the Ent data to some other storage using an external bus (like Kafka or Redis Streams), despite this system "bus+PostgreSQL" being not transactionally safe as a whole.

### beforeUpdate Triggers

Update is a more complicated operation, since you have the old row and the new row versions at the same time.

```typescript
...
beforeUpdate: [
  async (vc, { oldRow, input, newRow }) => {
    await addToKafka(this.name, newRow.id);
    if (newRow.subject !== oldRow.subject) {
      // Notice that newRow.subject is a non-optional
      // string property, whilst input.slug is optional
      // (i.e. string | undefined).
      let slug = slugufy(newRow.subject);
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
* `input`: properties passed to `update*()` method as they are. Notice that it includes **not** all Ent fields, but only the fields you are mutating (in other words, all properties of `input` object are _optional_ in their TypeScript typing). You need to  modify this object if you want the trigger to make changes in the Ent before the update happens.
* `newRow`: the result of applying `input` over `oldRow` . This is an immutable object.

### Immutable Fields

Using `beforeUpdated`, you can force some Ent field to be _immutable_, so any `update*()` call will not change it:

```typescript
...
beforeUpdate: [
  function SlugIsImmutable(vc, { oldRow, input }) => {
    input.slug = oldRow.slug;
  },
],
...
// This value won't be saved.
await topic.updateReturningX({ slug: "new-value" });
```

### beforeDelete Triggers

This kind of triggers is the simplest:

```typescript
...
beforeDelete: [
  async (vc, { oldRow }) => {
    await addToKafka(this.name, oldRow.id);
    await mapJoin(
      await EntComment.select(vc, { topic_id: oldRow.id }, 1000000),
      async (comment) => comment.deleteOriginal(),
    );
  },
],
...
await topic.deleteOriginal();
```

In this example, we do two things:

1. We call `addToKafka()` function to e.g. publish the deletion event to our event bus, so we can replay that deletion to some other data store in an eventually consistent manner. If publishing to Kafka fails, them the trigger will throw an error, and no deletion will happen in the database. If deletion succeeds, then we can be sure that it also got replayed to Kafka (since it's done prior to the deletion). And if deletion fails... then the user will see it and retry later.
2. We delete all children comments when the topic is deleted. This is a kind of `ON DELETE CASCADE` clause in relational database's foreign keys, but with an important difference: it calls Ent Framework triggers on the comments as well.

### beforeMutation Triggers

Notice that we have some boilerplate in our triggers:

* We call `addToKafka()` in 3 places: `beforeInsert/Update/Delete` triggers.
* We have the exact same logic to calculate `slug` field in 2 places: `beforeInsert/Update` .

To eliminate that, there is a special feature: `beforeMutation` triggers, which are called before _any_ mutation (be it insert, update or delete), in a TypeScript-safe way for the arguments.

```typescript
...
beforeMutation: [
  async (vc, { newOrOldRow }) => {
    await addToKafka(this.name, newOrOldRow.id);
  },
  async (vc, { op, newOrOldRow, input }) => {
    if (
      op === "INSERT" ||
      (op === "UPDATE" && "subject" in input && newOrOldRow.subject !== input.subject)
    ) {
      let slug = slugufy(newOrOldRow.subject);
      if (await EntTopic.exists(vc, { slug })) {
        slug += `-${Date.now()}`;
      }
      input.slug = slug;
    }
  },
],
beforeDelete: [
  async (vc, { oldRow }) => mapJoin(
    await EntComment.select(vc, { topic_id: oldRow.id }, 1000000),
    async (comment) => comment.deleteOriginal(),
  ),
],
...
const topic = await EntTopic.insertReturning(vc, {
  creator_id: "123",
  subject: "My Topic",
});
await topic.updateReturningX({ subject: "Hello" });
await topic.deleteOriginal();
```

There are 2 gotchas here:

1. We split one big trigger into two independent ones. The triggers are run sequentially, and the next trigger in the list is not called if the previous one throws an error.
2. TypeScript is smart enough to understand that, when you check `op` against `"INSERT"` or `"UPDATE"` strings, the typing of `newOrOldRow` and `input` arguments will be according to the operation types (i.e. it will respect optional properties for instance).

### Changed Fields Tracking and React's useEffect() Analogy

But you are probably still not satisfied with that long `if` clause in the example above. We can improve the code:

```typescript
...
beforeMutation: [
  async (vc, { newOrOldRow }) => {
    await addToKafka(this.name, newOrOldRow.id);
  },
  [
    (vc, row) => [row.subject], // "deps builder"
    async (vc, { op, newOrOldRow, input }) => {
      if (op !== "DELETE") {
        let slug = slugufy(newOrOldRow.subject);
        if (await EntTopic.exists(vc, { slug })) {
          slug += `-${Date.now()}`;
        }
        input.slug = slug;
      }
    },
  ],
],
...
```

Here we pass a tuple with 2 lambdas:

1. The 1st lambda, `(vc, row) => [row.subject]`, is called "deps builder". It extracts some part of the row, and Ent Framework will call the trigger code **only if** that part has actually changed on an update (and also on insert/delete, since those are also considered as "changes")
2. The 2nd lambda is your trigger code. Ent Framework will run it only if the 1st callback returned a value different between the old and the new rows (or it's an insert or delete operation).  If you are familiar with React, you can notice that this mechanism is similar to how its `useEffect()` hook works.

In the trigger code, you still need to check that the operation is not `DELETE`, but it is way better still than having a boilerplate in the previous example.

The "deps builder" lambda can be async, so you can run other database queries in it and make decisions based on their results.

Notice that "deps builder" tuple also works for `beforeUpdate`, as well as for `afterUpdate` and `afterMutation` triggers we'll discuss below.

## After-Triggers

After-triggers are called seqentially, as soon as an insert/update/delete mutation succeeds in the database.

### afterInsert Triggers

Triggers of this kind act exactly as `beforeInsert`, but they are called after a successful database operation, not before. There, you can do some auxiliary work, but keep in mind that, if this work fails, the Ent will remain created in the database still. There are no (and cannot be) built-in transactions across multiple independent IO services and multiple different microshards.

```typescript
...
afterInsert: [
  async (vc, { input }) => {
    ...
  },
],
...
```

### afterUpdate Triggers

The only difference with `beforeUpdate` triggers here is that there is no `input` argument passed: the only things you have are `oldRow` and `newRow` :

```typescript
...
afterUpdate: [
  async (vc, { oldRow, newRow }) => {
    ...
  },
],
...
```

You can also use "deps builder" syntax in `afterUpdate`, to run the trigger code only if some particular fields change:

```typescript
...
afterUpdate: [
  ...
  [
    (vc, row) => [row.subject], // "deps builder"
    async (vc, { oldRow, newRow }) => {
      ...
    },
  ],
],
...
```

### afterDelete Triggers

In `afterDelete`, you can run some optional cleanup of other resources associated to the just-deleted Ent. Keep in mind though that it's all non-transactional: if your cleanup fails, it won't be retried, and the row will already be deleted in the database.

```typescript
...
afterDelete: [
  async (vc, { oldRow }) => {
    ...
  },
],
...
```

### afterMutation Triggers

Similarly to `beforeMutation` triggers, `afterMutation` triggers allow you to react on any of insert/update/delete operations. but only after this operation succeeds in the database.&#x20;

There is also no `input` argument available in this kind of triggers, only `newOrOldRow`.

```typescript
...
afterMutation: [
  async (vc, { op, newOrOldRow }) => {
    ...
  },
],
...
```

You can use "deps builder" syntax too if you want to react only when some particular fields change on an update (or on insert and delete unconditionally):

```typescript
...
afterMutation: [
  [
    (vc, row) => [row.subject], // "deps builder"
    async (vc, { op, newOrOldRow }) => {
      ...
    },
  ],
],
...
```
