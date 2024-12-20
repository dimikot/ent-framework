# Custom Field Refactoring

In [custom-field-types.md](../getting-started/custom-field-types.md "mention") article, we discussed, how you can add Ent fields of an arbitrary shape to your Ent class.&#x20;

You also learned, how easy it is to modify the custom type when you add new properties.

Although adding optional and required properties to custom types covers the absolute most of cases, sometimes we want to do a large refactoring, changing the shape of the data entirely. It's harder to do, since you need to deal with both the old format and the new format at all times (unless you want to rewrite all the rows in your database).

There are some best practices still, and TypeScript helps here a lot.

## Backward/Forward Compatibility Aspects

When modifying custom types, it's crucial to think about the database schema migration and backward compatibility aspects, especially when you add non-optional properties to your type, or when you change inner types of the properties.

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

## Deployment 1: New Format in Code, Old Format in Database

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

## Deployment 2: New Format in Writes, Ability to Read Old Format Still

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
