# Custom Field Types

In addition to [built-in-field-types.md](built-in-field-types.md "mention"), you can also defined custom strongly-typed fields.

The values stored in custom fields will be serialized before storing to the database, and on read, deserealized back. Typically, the serialization format is JSON (so you can use PostgreSQL column types like `jsonc` or `json`), but you can also use other formats (like array of `bigint`, array of `varchar` or anything else).

## JSON-Serialized Fields

Let's first consider the simplest and the most common case of custom field types, where a fied is stored as a `jsonc` value in a PostgreSQL Ent table.

Imagine we want to add a new custom field `actors` to `topics` table, internally stored as a JSON:

```sql
CREATE TABLE topics(
  id bigserial PRIMARY KEY,
  ...
  actors: jsonc NOT NULL
);
```

You define a custom type by providing an object with 3 callbacks:

```typescript
type Actors = {
  editor_ids: string[];
  // will add more fields later
};

const ActorsType = {
  dbValueToJs(v: unknown): Actors {
    // node-postgres already parses jsonc internally,
    // so we don't need anything more here
    return v;
  },
  
  stringify(obj: Actors): string {
    return JSON.stringify(v);
  },
  
  parse(v: string): Actors {
    return JSON.parse(v);
  },
}
```

* `dbValueToJS(v)`: given a value from node-postgres row, converts it to a strongly typed TypeScript value. (Notice that node-postgres already does some conversions internally: e.g. an array field, `v` returned by the engine is already an array of things, so `dbValueToJs` for it will just do nothing.) The return type of this callback will automatically become the custom field's TypeScript type. Ent Framework will execute this callback every time you load an Ent from the database.
* `stringify(obj)`: given a value of your custom type, converts it into a string representation compatible with PostgreSQL value. Ent Framework will run this callback every time you use the custom field in any query (e.g. insert/update/delete or even when selecting Ents).
* `parse(str)`: this callback is the opposite of `stringify()`. Ent Framework doesn't call it (since it uses `dbValueToJs` instead), but for convenience and completeness of the interface, it's still here.

Once the above 3 callbacks are defined, you can declare a field of custom type in your schema:

```typescript
const schema = new PgSchema(
  "topics",
  {
    ...
    actors: { type: ActorsType },    
  },
  ["slug"]
);
...
const topic = await EntTopic.insertReturning(vc, {
  ...,
  actors: { editor_ids: ["42"] },
});
...
console.log(topic.actors.editor_ids);
...
await topic.updateChanged({
  actors: { editor_ids: ["101"] },
});
```

## Adding an Optional Property to Custom Type

When you have a custom type, you'll most likely want to modify it in the future.

The simplest possible modification is adding an optional property:

```typescript
type Actors = {
  editor_ids: string[];
  viewer_ids?: string[]; // <-- added; optional
};
```

You don't need to change anything else:&#x20;

* Your existing rows in the database (without `viewer_ids`) will be readable by the new code, since the property is optional.
* When your code assigns a value to `viewer_ids`, it will also be written to the database, and it won't conflict with the old code that can still be running somewhere in the cluster.

## Adding a Required Property to Custom Type

Optional propertied are good (and in fact they are the only "officially recommended" way of adding properties in serialization protocols like [protobuf](https://protobuf.dev)), but optionality adds a technical debt spaghetti everywhere in your code where you work with your new properties. A better variant would be to make the property **required**.

```typescript
type Actors = {
  editor_ids: string[];
  viewer_ids: string[]; // <-- added; required
};

const ActorsType = {
  dbValueToJs(v: /* a little lie */ Actors): Actors {
    v.viewer_ids ??= []; // <-- added
    return v;
  },
  
  stringify(obj: Actors): string {
    return JSON.stringify(v);
  },
  
  parse(v: string): Actors {
    return this.dbValueToJs(JSON.parse(v));
  },
}
```

The only change you need to make in `ActorsType` is to default-assign `[]` to `viewer_ids` property. Notice that we lie to TypeScript here a little: `v` argument of `dbValueToJs(v)` is in fact of type `Actors & { viewer_ids?: string[] }`, not of type `Actors`. But for simplicity, it's acceptable.

## Changing the Shape Significantly

See [custom-field-refactoring.md](../advanced/custom-field-refactoring.md "mention") in Advanced section.
