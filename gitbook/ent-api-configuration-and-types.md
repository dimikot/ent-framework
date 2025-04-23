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

## EntUser.VALIDATION

This static Ent property allows you to manually run  privacy and validation rules on an Ent without triggering an insert/update/delete. It is convenient if you want do a "dry-run" before applying an actual operation, to e.g. enable or disable some form controls or buttons in the user interface.

```typescript
try {
  await EntUser.VALIDATION.validateUpdate(vc, user, {
    email: "new@example.com"
  });
} catch (e: unknown) {
  if (e instanceof EntAccessError) {
    // It's a top-level base class for all access related errors.
    if (e instanceof EntNotUpdatableError) {
      // Privacy rules failure with details.
      console.log(e.message);
    } else if (e instanceof EntValidatonError) {
      // Fields validation error.
      console.log(e.errors);
      console.log(e.toStandardSchemaV1()); // https://standardschema.dev
    } else {
      ...
    }
  } else {
    throw e;
  }
}
```

The methods available on `VALIDATION` property are:

* `validateInsert(vc, input: InsertInput<TTable>)`: checks what would happen if you try to insert a new Ent with such properties.&#x20;
* `validateUpdate(vc, old: Row<TTable>, input: UpdateInput<TTable>, privacyOnly: boolean)`: we already mentioned this method in the example above. You can also pass the last `privacyOnly` parameter as `true` if you do not want to run user-defined fields validators and only need to recheck the privacy rules. Otherwise, by default, it runs both privacy rules and fields validators, which is almost always what we want.
* `validateDelete(vc, row: Row<TTable>)`: rarely used, checks what would happen if you try to delete that Ent.&#x20;

Notice that `Row<TTable>` is not the same as an instance of your Ent (although you can pass an Ent to the functions that accept a `Row` type). Rows are a lower level concept: `Row<TTable>` represents a plain object, it's basically a strongly-typed TypeScript `Record` of fields and their values (including nullability concept, custom field types etc.). Rows don't have `vc` property, nor do they have any Ent specific methods.&#x20;

And as mentioned above, `TTable` is derived from the Ent schema, e.g.  `typeof EntUser.SCHEMA.table`.

