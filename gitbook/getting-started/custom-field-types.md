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
  viewer_ids: string[];
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
  actors: { editor_ids: ["42"], viewer_ids: [] },
});
...
console.log(topic.actors.editor_ids);
...
await topic.updateChanged({
  actors: { editor_ids: [], viewer_ids: ["42"] },
});
```

## Adding an Optional Field to Custom Type

When you have a custom type, you'll most likely want to modify it in the future.

The simplest possible modification is adding an optional property:

```typescript
type Actors = {
  editor_ids: string[];
  viewer_ids: string[];
  commenter_ids?: string[]; // added; optional
};
```

You don't need to change anything else:&#x20;

* Your existing rows in the database (without `commenter_ids`) will be readable by the new code, since the field is optional.
* When your code assigns a value to `commenter_ids`, it will also be written to the database, and it won't conflict with the old code that can still be running somewhere in the cluster.

## Adding a Required Field to Custom Type

Optional fields are good, but it adds a technical debt of tealing with them everywhere in your code. A better variant would be to make the field required.

## Backward/Forward Compatibility Aspects

When working with custom types, it's crucial to think about the database schema migration and backward compatibility aspects, especially when you add non-optional properties to your type, or when you change inner types of the properties.

The hardest thing here is that you need to care not only about backward compatibility (when you must be ready to read the old data format from the existing database rows), but also about forward compatibility (i.e. be ready to **write** the data in an old format), because there may still be the readers in the cluster running the old code and expecting the old data format.

Let's get back to the type which we defined previously:

```typescript
type ActorsV1 = {
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
type Actors = {
  editor_ids: Array<{ id: string; ts: number; }>;
  viewer_ids: Array<{ id: string; ts: number; }>;
};
```

### Deployment 1: New Format in Code, Old Format in Database

As a preliminary step, we need to rename `Actors` to `ActorsV1`, to declare it as an "old data format". This, newest format that we'll introduce will always be named as just `Actors`.

To transition between the custom type formats, we then need to update the code to let it work with `Actors`. But the code must still **write** the data in the old `ActorsV1` format: the deployment is not an immediate process, so there are periods of time when Node processes with the new code and Node processes with the old code run at the same time.

```typescript
function typecheck<T>(v: T): T {
  return v;
}

const ActorsType = {
  // Accepts BOTH the old format and the new format. Returns new format.
  dbValueToJs(obj: ActorsV1 | Actors): Actors {
    return {
      editor_ids: obj.editor_ids.map(
        (v) => typeof v === "string" ? { id: v, ts: Date.now() } : v,
      ),
      ...
    };
  },
  
  // Accepts only new format. Stringifies to the old format.
  stringify(obj: Actors): string {
    return JSON.stringify(typecheck<ActorsV1>({
      editor_ids: obj.editor_ids.map((v) => v.id),
      ...
    }));
  },
  
  // Auxiliary counter-part to stringify().
  parse(v: string): Actors {
    return this.dbValueToJs(JSON.parse(v));
  },
}
```

The idea is following:

1. In our code, we always work with the new format, `Actors`.
2. When writing to the database, we use the old format, `ActorsV1`.
3. When reading from the database, we are able to recognize both the old format `ActorsV1` and the new format `Actors`. This behavior will remain with us forever, becuse we'll keep having the data stored in the database in old format.

Notice how much TypeScript does help us here: it ensures that we won't return nor accept a mismatched type in both `dbValueToJs()` and `stringify()` (try returning some different shape, and you'll see a compile-time error):

* `dbValueToJs(obj: ActorsV1 | Actors)` allows us to work with a union type, which is safer than working with e.g. `any`.
* `return JSON.stringify(typecheck<ActorsV1>({ ... }))` doesn't let us to return data in a wrong format and ensures that it conforms the `ActorsV1` shape.

This change in the code needs to be deployed, and we must be sure that there is no old code running anywhere before continuing.

### Deployment 2: New Format in Writes, Ability to Read Old Format Still

Once we're sure that the code can read both the old data format `ActorsV1` and the new format `Actors`, we can proceed with the 2nd step: switch to writing the new data in the new format. We can do so, because there are no old readers in the cluster anymore.

The final permanent code will be:

```typescript
function typecheck<T>(v: T): T {
  return v;
}

// Internal to this file (not exported).
type ActorsV1 = {
  editor_ids: string[];
  viewer_ids: string[];
};

export type Actors = {
  editor_ids: Array<{ id: string; ts: number; }>;
  viewer_ids: Array<{ id: string; ts: number; }>;
};

export const ActorsType = {
  // Accepts BOTH the old format and the new format.
  // This code about ActorsV1 will remain here forever.
  dbValueToJs(obj: ActorsV1 | Actors): Actors {
    return {
      editor_ids: obj.editor_ids.map(
        (v) => typeof v === "string" ? { id: v, ts: Date.now() } : v,
      ),
      ...
    };
  },
  
  // Accepts only new format. Stringifies to the new format.
  stringify(obj: Actors): string {
    return JSON.stringify(obj);
  },
  
  // Auxiliary counter-part to stringify().
  parse(v: string): Actors {
    return this.dbValueToJs(JSON.parse(v));
  },
}
```

In the future, if we need to change the format one more time in an incompatible way, we'll need to introduce `ActorsV2` (as an initial copy of `Actors`) and do 2 deployments again.
