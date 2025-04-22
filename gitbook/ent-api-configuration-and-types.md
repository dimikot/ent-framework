# Ent API: Configuration and Types

Every Ent class exposes several static "constant" properties that can be used to get access to various Ent configuration features.

Consider having the following Ent class defined:

```typescript
const schema = new PgSchema(
  "users",
  {
    id: { type: ID, autoInsert: "nextval('users_id_seq')" },
    email: { type: String },
  },
  ["email"]
);

export class EntUser extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: async (_vc, row) => row.id,
      privacyLoad: [new AllowIf(new OutgoingEdgePointsToVC("id"))],
      privacyInsert: [],
    });
  }
}
```

## EntUser.CLUSTER

This static property simply equals to `cluster` parameter of `BaseEnt` you are extending when defining your Ent class. Use it in case you need to access some low-level Cluster API:

```typescript
const master = await EntUser.CLUSTER.globalShard().client(MASTER);
```

## EntUser.SCHEMA

Similarly, it is equal to `BaseEnt`'s `schema` parameter. Each Schema has the following properties:

* `name`: name of the underlying Ent table ("users" in the above example)
* `table`: an stronly typed object that defines the table's shape. In our example it is `{ id: ..., email: ... }` ,  exactly as defined in `new PgSchema(...)` code above.
* `uniqueKey`: a strongly typed array of fields composing the Ent Schema's unique key. Again, exactly as defined in `PgSchema` above.

Examples:

```typescript
// ["id", "email"]
const fields = Object.keys(EntUser.SCHEMA.table);

// Using the Row type and table name.
const master = await EntUser.CLUSTER.globalShard().client(MASTER);
const rows = await master.query<Row<typeof EntUser.SCHEMA.table>>({
  query: [`SELECT * FROM ${EntUser.SCHEMA.name} WHERE id=?", userID],
  isWrite: false,
  annotations: [vc.toAnnotation()],
  op: "MY_SELECT",
  table: "users",
});

// Build a custom WHERE condition.
const where: Where<typeof EntUser.SCHEMA.table> = { 
  email: { $not: "test@example.com" },
};
await EntUser.select(vc, where, 100);
```

Notice how we used `typeof EntUser.SCHEMA.table` in the example above: it's a common pattern in Ent Framework. Most of the types it exposes (like `Row`, `Where` etc.) accept a generic `TTable` argument that can be obtained with this construction.
