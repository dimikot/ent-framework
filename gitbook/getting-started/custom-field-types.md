# Custom Field Types

In addition to [built-in-field-types.md](built-in-field-types.md "mention"), you can also defined custom strongly-typed fields.

The values stored in custom fields will be serialized before storing to the database, and on read, deserealized back. Typically, the serialization format is JSON (so you can use PostgreSQL column types like `jsonc` or `json`), but you can also use other formats (like array of `bigint`, array of `varchar` or anything else).

## JSON-Serialized Fields

```typescript
const ActorType = {
  dbValueToJs(v: unknown): {
    viewer_ids: string[];
    editor_ids: string[];
  } {
    return v;
  }
  stringify(obj: unknown) {
    return JSON.stringify(v);
  }
  parse(v: string) {
    return JSON.parse(v);
  }
}

const schema = new PgSchema(
  "topics",
  {
    ...
    actors: { type: ActorsType },    
  },
  ["slug"]
);
```

