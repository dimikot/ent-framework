# Ent API: Configuration and Types

Every Ent class exposes several static "constant" properties that you can use to get access to various Ent configuration features.

## Ent Class Static Properties

Consider having the following Ent class defined:

```typescript
const schema = new PgSchema(
  "users",
  {
    id: { type: ID, autoInsert: "nextval('users_id_seq')" },
    email: { type: String },
  },
  ["email"],
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

### EntClass.SCHEMA

In the example above, `EntUser.SCHEMA`  it is equal to `BaseEnt`'s `schema` parameter. Each Schema has the following properties:

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
  query: [`SELECT * FROM ${EntUser.SCHEMA.name} WHERE id=?`, userID],
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

### Helper (Input) Types

Ent Framework API methods like `insert*()`, `update*()`, `load*()`, `select*()`  etc. accept strongly-typed input and return strongly typed Ents. Here are some examples:

* `InsertInput<typeof EntUser.SCHEMA.table>`: the shape of the object that `insert*()`  and `upsert*()`  methods accept. This type plays nice with e.g. optional fields (the fields that have `autoInsert`  in their definition), nulls etc.
* `UpdateInput<typeof EntUser.SCHEMA.table>`: methods like `update*()`  accept this shape. Since you can choose, which fields to update, all of the properties of that type are optional.
* `Row<typeof EntUser.SCHEMA.table>` : that's a general shape of Ents returned from `load*()`  and  `select*()`  calls. Notice that the type is very different from InsertInput, because it never has any optional fields. Optionality is the concept related to _mutations_; once you load something existing from the database, all the fields are present, so they will all be "required". Don't mix up `Row`  and `InsertInput` types!
* `Where<typeof EntUser.SCHEMA.table>`: a query that `select()`  call accepts. It supports rich query language features like `$not`, `$and`, `$lt`  etc. See more details in [ent-api-select-by-expression.md](getting-started/ent-api-select-by-expression.md "mention").

There are some other, less frequently, used types as well. See the docblocks in Ent Framework source code for more details and examples.

### EntClass.VALIDATION

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

### EntClass.CLUSTER

This static property simply equals to `cluster` parameter of `BaseEnt` you are extending when defining your Ent class. Use it in case you need to access some low-level Cluster API:

```typescript
const master = await EntUser.CLUSTER.globalShard().client(MASTER);
```

### EntClass.SHARD\_AFFINITY and .SHARD\_LOCATOR

The `SHAR_AFFINITY` static property simply returns the value of `shardAffinity` configuration option.

The `SHARD_LOCATOR` property is pretty low-level: it exposes an Ent Framework object that allows to infer the affected microshards based on various criteria (like from an ID, or from a `Where<TTable>` clause, or from a list of IDs etc.): `singleShardForInsert()`, `multiShardsFromInput()`, `singleShardFromID()` etc. Those methods are aware of the Ent's Inverses (see [inverses-cross-shard-foreign-keys.md](scalability/inverses-cross-shard-foreign-keys.md "mention")), but we won't discuss them here much.

It also exposes a useful method `allShards()`:

```typescript
const userShards = EntUser.SHARD_LOCATOR.allShards();
for (const shard of userShards) {
  // do something with users on this shard
}
```

Depending on the Ent's `shardAffinity`, this method will return either one shard (if it's `GLOBAL_SHARD`) or all shards of the cluster (in case it's `RANDOM_SHARD` or some other affinity), thus, allowing you to iterate over all Ents of this type in the cluster. Read more about sharding in [shard-affinity-ent-colocation.md](scalability/shard-affinity-ent-colocation.md "mention").

### EntClass.TRIGGERS&#x20;

This static property exposes a `Triggers` objects that allows you to enumerate all of the Ent's trggers. It is almost never used externally, so we'll skip the details (see the source code if you want to learn more).

## EntClass and Ent Interfaces

Sometimes you want to write a generic function that accepts _any_ Ent of a particular shape, or _any_ Ent class. You can use EntClass and Ent interfaces (type shapes) for this. Here are some pretty artificial examples:

```typescript
async function fancyDelete<TTable extends Table & { key: String }>(
  ent: Ent<TTable>,
): Promise<void> {
  ...
  await deleteExternalResource(ent.key);
  await ent.deleteOriginal();
}

async function loadAny<TTable extends Table>(
  vc: VC,
  EntCls: EntClass<TTable>,
  id: string,
): Promise<Ent<TTable>> {
  return EntCls.loadIfReadableNullable(vc, id);
}
```

Unfortunately, due to some TypeScript limitations (incomplete mixins support and a lack of class static properties typing), the functionality of EntClass and Ent interfaces is limited. But keep them in mind still, since they may be useful.
