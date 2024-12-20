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
type ActorsValue = {
  editor_ids: string[];
  viewer_ids: string[];
};

const ActorsType = {
  dbValueToJs(v: unknown): ActorsValue {
    // node-postgres already parses jsonc internally,
    // so we don't need anything more here
    return v;
  },
  
  stringify(obj: ActorsValue): string {
    return JSON.stringify(v);
  },
  
  parse(v: string): ActorsValue {
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
  actors: { editor_ids: ["42"], viewer_ids: [] },
});
...
console.log(topic.actors.editor_ids);
...
await topic.updateChanged({
  actors: { editor_ids: [], viewer_ids: ["42"] },
});
```

## Backward/Forward Compatibility Aspects

When working with custom types, it's crucial to think about the database schema migration and backward compatibility aspects, especially when you add non-optional properties to your type, or when you change inner types of the properties.

The hardest thing here is that you need to care not only about backward compatibility (when you must be ready to read the old data format from the existing database rows), but also about forward compatibility (i.e. be ready to **write** the data in an old format), because there may still be the readers in the cluster running the old code and expecting the old data format.

Let's get back to the type which we defined previously:

```typescript
type ActorsValueV1 = {
  editor_ids: string[];
  viewer_ids: string[];
};
...
const topic = await EntTopic.insertReturning(vc, {
  ...,
  actors: { editor_ids: ["42"], viewer_ids: [] },
});
```

Here, we stored a row to the database, so it remains there:

```
ROW(id="123", ..., actors='{"editor_ids":["42"],"viewer_ids":[]}')
```

Imagine now that we want to significantly change the type: instead of storing just user IDs, we also want to store the timestamps when those users performed an action last time:

```typescript
type ActorsValue = {
  editor_ids: Array<{ id: string; ts: number; }>;
  viewer_ids: Array<{ id: string; ts: number; }>;
};
```

### Deployment 1: New Format in Code, Old Format in Database

As a preliminary step, we need to rename `ActorsValue` to `ActorsValueV1`, to declare it as an "old data format". This, newest format that we'll introduce will always be named as just `ActorsValue`.

To transition between the custom type formats, we then need to update the code to let it work with `ActorsValue`. But the code must still **write** the data in the old `ActorsValueV1` format: the deployment is not an immediate process, so there are periods of time when Node processes with the new code and Node processes with the old code run at the same time.

```typescript
const ActorsType = {
  // Accepts BOTH the old format and the new format. Returns new format.
  dbValueToJs(obj: ActorsValueV1 | ActorsValue): ActorsValue {
    return {
      editor_ids: obj.editor_ids.map(
        (v) => typeof v === "string" ? { id: v, ts: Date.now() } : v,
      ),
      ...
    };
  },
  
  // Accepts only new format. Stringifies to the old format.
  stringify(obj: ActorsValue): string {
    return JSON.stringify({
      editor_ids: obj.editor_ids.map((v) => v.id),
      ...
    } as ActorsValueV1);
  },
  
  // Auxiliary counter-part to stringify().
  parse(v: string): ActorsValue {
    return this.dbValueToJs(JSON.parse(v));
  },
}
```

The idea is following:

1. In our code, we always work with the new format, `ActorsValue`.
2. When writing to the database, we use the old format, `ActorsValueV1`.
3. When reading from the database, we are able to recognize both the old format `ActorsValueV1` and the new format `ActorsValue`. This behavior will remain with us forever, becuse we'll keep having the data stored in the database in old format.

Notice how much TypeScript does help us here: it ensures that we won't return nor accept a mismatched type in both `dbValueToJs()` and `stringify()` (try returning some different shape, and you'll see a compile-time error):

* `dbValueToJs(obj: ActorsValueV1 | ActorsValue)` allows us to work with a union type, which is safer than working with e.g. `any`.
* `return JSON.stringify({ ... } as ActorsValueV1)` doesn't let us to return data in a wrong format and ensures that it conforms the `ActorsValueV1` shape.

This change in the code needs to be deployed, and we must be sure that there is no old code running anywhere before continuing.

### Deployment 2: New Format in Code and DB, Able to Read Old Format&#x20;

Once we're sure that the code can read both the old data format `ActorsValueV1` and the new format `ActorsValue`, we can proceed with the 2nd step: switch to writing the new data in the new format.
