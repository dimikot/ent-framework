# Privacy Rules

A crucial reason on why Ent Framework exists at all is its privacy layer. No data exits the API unless it's rechecked against a set of explicitly defined security predicates. In other words, when you have multiple users in your service, you can enforce the strict guarantees that one user can't see other user's data even in theory.

In relational databases world, this concept is called "row-level security".&#x20;

## Disadvantages of PostgreSQL Built-in Row Level Security

We need to mention that some support for row-level security is [built in to PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), but it has several drawbacks which makes it almost useless in web development:

1. It is expensive and, at the same time, too "sloppy" and low-level (the amount of DDL code you need to write is large, and there is no framework in place to help you with it).
2. There is no support for "per-transaction variables" in PostgreSQL (no per-session variables as well), so if you want to pass an "acting user ID" (similar to Ent Framework VC's Principal), other than the database DDL user/role, into the query, then you can't.
3. PostgreSQL doesnt't support microsharding, so you basically can't recheck security against the data living in a different microshard.

## How Ent Framework Privacy Rules Work

In each Ent class, you need to define an explicit set of rules and determine, can a VC read that Ent, create a new Ent, update the Ent and delete the Ent:

```typescript
const schema = new PgSchema(
  "comments",
  {
    id: { type: ID, autoInsert: "nextval('comments_id_seq')" },
    created_at: { type: Date, autoInsert: "now()" },
    topic_id: { type: ID },
    creator_id: { type: ID },
    message: { type: String },
  },
  []
);

export class EntComment extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: ["topic_id"],
      privacyInferPrincipal: async (_vc, row) => row.creator_id,
      privacyLoad: [
        new AllowIf(new OutgoingEdgePointsToVC("creator_id")),
        new AllowIf(new CanReadOutgoingEdge("topic_id", EntTopic)),
      ],
      privacyInsert: [
        new Require(new OutgoingEdgePointsToVC("creator_id")),
        new Require(new CanReadOutgoingEdge("topic_id", EntTopic))
      ],
      // privacyUpdate and privacyDelete derive from privacyInsert
      // if they are not explicitly specified.
    });
  }
}
```

### privacyLoad Rules and Graph Reachability

When you run e.g. `EntComment.loadX(vc, "123")` or any other API call, like `loadBy*()` or `select()`, Ent Framework runs `privacyLoad` rules for each Ent.

Typically, a **Rule** class used in `privacyLoad` is `AllowIf`: it allows reading the Ent immediately as soon as the passed **Predicate**  succeeds. There are several pre-defined Predicate classes, and you can also create your own predicates, or just pass an async boolean function; we'll discuss it a bit later.

So, the logic in the example is following:

1. `new OutgoingEdgePointsToVC("creator_id")`: if `comment.creator_id` equals to `vc.principal`, then the read is immediately allowed. It means that you (`vc`) are trying to read a commend which you created (its `creator_id` is your user ID).
2. `new CanReadOutgoingEdge("topic_id", EntTopic)`:  if `vc.principal` is able to run `EntTopic.loadX(vc, comment.topic_id)` successfully, then reading of the comment is immediately allowed. This is an extremely powerful construction, the essence of Ent Framework's privacy layer: you can **delegate** privacy checks to other Ents in the graph. And since the engine does batching and caching aggressively, this all will be performance efficient.

Idiomatically, `privacyLoad` defines access permissions in terms of **graph edges reachability**: typically, if there is **at least one** path in the graph originating from the VC and ending at the target Ent, then this VC is allowed to read the Ent.

### privacyInsert and Referential Permissions

As opposed to `privacyLoad`, where a single succeeded rule allows the read, for `privacyInsert` (as well as `privacyUpdate` and `privacyDelete`), **all of them** must pass typically.

This is because the ability to insert an Ent means that the VC has permissions to reference other Ents in **all** field edges. In reality, for every field edge (foreign key) defined in the Ent, there should be at least one associated **Require** privacy rule.

Having permissions to insert an Ent is almost always the same as having permissions to reference other Ents in its foreign key fields. If we forget to check some of the field edges, then it is possible that the user will be able to create an Ent "belonging" to someone else (by e.g. referencing someone else's ID).

The logic in the example above:

1. `new Require(new OutgoingEdgePointsToVC("creator_id"))`: it is **required** that the value of `comment.creator_id` is equal to `vc.principal`. I.e. you can only reference yourself as a creator of the just inserted comment.
2. `new Require(new CanReadOutgoingEdge("topic_id", EntTopic))`: it is **required** that, to create a comment on some topic, you must have at least read access to that topic. I.e. you can create comments on someone else's topics too, as soon as you can read those topics.

Notice that here we again use delegation: instead of introducing complicated boilerplate in comments privacy rules, we say: "I fully trust the way how privacy is implemented at EntTopic, and I don't want to know details about it at EntComment level". Basically, you build a **chain of trust**.

### privacyUpdate and privacyDelete

`privacyUpdate/Delete` rules are similar to `privacyInsert`, but they are checked by `update*()` and `delete*()` calls correspondingly.

If there is no `privacyUpdate` block defined, then the rules are inherited from `privacyInsert` array.

If there is no `privacyDelete` block mentioned in the configuration, then Ent Framework uses `privacyUpdate` rules for it. (And if there are no `privacyUpdate` rules, then `privacyInsert`).

## Rule Classes

Item in `privacyLoad/Insert/Update/Delete` arrays are called a **Rules**. There are several built-in rules:

* `new AllowIf(predicate)`:  if `predicate` resolves to true and doesn't throw, allows the access immediately, without checking the next rules. Commonly, `AllowIf` is used in `privacyLoad` rules. It checks that there is **at least one** path in the graph originating at the user denoted by the VC and ending at the target Ent. Also, you may use `AllowIf` in the prefix of `privacyInsert/Update/Delete` rules to e.g. allow an admin VC access the Ent early, without checking all other rules.
* `new Require(predicate)`: if `predicate`resolves to true and doesn't throw, tells Ent Framework to go to the next rule in the array to continue. If that was the last `Require` rule in the array, allows access. This rule is commonly used in `privacyInsert/Update/Delete` blocks, where the goal is to insure that **all** rules succeed.
* `new DenyIf(predicate)`: if `predicate` returns true **or throws an error**, then the access is immediately rejected. This rule is rarely useful, but you can try to utilize it for ealy denial of access in any of the privacy arrays.

## Predicates

**Predicate** is like a function which accepts an acting VC and a database row. It returns true/false or throws an error.

### Custom Functional Predicates

The simplest way to define a predicate is exactly that, pass it as an async function:

```typescript
privacyLoad: [
  new AllowIf(new OutgoingEdgePointsToVC("id")),
  new AllowIf(async function CommentIsInPublicTopic(vc, row) {
    const topic = await EntTopic.loadX(vc, row.topic_id);
    return topic.published_at !== null;
  }),
]
```

Notice that we gave this function an inline name, `CommentIsInPublicTopic`. If the predicate returns false or throws an error, that name will be used as a part of the error message. Of course we could just use an anonymous lambda (like `async (vc) => {}`), but if we did so and the predicate returned false, then the error won't be much descriptive.

Here, `row` is strongly-typed: you can use Ent data fields. It is not an Ent instance though, which is currently a TypeScript limitation: you can't self-reference a class in its mixin.

### Custom Class Predicates

You can also define preticates as classes, to make them more friendly for debugging. In fact, Ent Framework's built-in predicates are implemented as classes.

As an example, let's see how a built-in predicate `CanReadOutgoingEdge` works:

```typescript
export class CanReadOutgoingEdge<TField extends string>
  implements Predicate<Record<TField, string | null>>
{
  readonly name;

  constructor(
    public readonly field: TField,
    public readonly toEntClass: EntClass,
  ) {
    this.name = `${this.constructor.name}(${this.field})`;
  }

  async check(vc: VC, row: Record<TField, string | null>): Promise<boolean> {
    const toID = row[this.field];
    if (!toID) {
      return false;
    }
    const cache = vc.cache(IDsCacheReadable);
    if (cache.has(toID)) {
      return true;
    }
    await this.toEntClass.loadX(vc, toID);
    // sill here and not thrown? save to the cache
    cache.add(toID);
    return true;
  }
}
```

Each predicate class must be defined with `implements Predicate` which requires the method `check(vc, row)` to be implemented, as well as the `name` property to exist.

In the class constructor, you accept any predicate configuration parameters and build a more descriptive `name` for the predicate instance than just the predicate name.

And in `check()` method, you implement your predicate's logic, the same way as you would do it in a functional predicate.

### Built-in Predicates

For convenience, Ent Framework already includes some of the most useful predicates. This set is constantly growing, so check [src/ent/predicates](https://github.com/clickup/ent-framework/tree/main/src/ent/predicates) for the most up-to-date list.

#### **new** [**True**](https://github.com/clickup/ent-framework/blob/main/src/ent/predicates/True.ts)**()**

This is the simplest possible predicate, since it always returns true. It is useful when you want to create an Ent class which can be read by anyone.

#### **new** [**OutgoingEdgePointsToVC**](https://github.com/clickup/ent-framework/blob/main/src/ent/predicates/OutgoingEdgePointsToVC.ts)**(field)**

Checks that `ent[field]` is equal to `vc.principal`. This is useful for fields like `created_by` or `user_id` or some similar cases, when you want to make sure that the VC's acting user is mentioned in the Ent field to make this field readable (or writable).

#### **new** [**CanReadOutgoingEdge**](https://github.com/clickup/ent-framework/blob/main/src/ent/predicates/CanReadOutgoingEdge.ts)**(field, ToEntClass)**

Delegates the  privacy check to another Ent Class (`ToEntClass`) considering that `toEnt.id` is equal to `ent[field]` . Sounds complicated, but in proactice it means the the VC has permissions to read another Ent that is parent to the current Ent, and is pointed by `field` . A good example is a predicate on EntComment: `privacyLoad: [new CanReadOutgoindEdge("topic_id", EntTopic)]` means that, to read this comment, the VC must be able to read its parent topic.

#### **new** [**CanUpdateOutgoingEdge**](https://github.com/clickup/ent-framework/blob/main/src/ent/predicates/CanUpdateOutgoingEdge.ts)**(field, ToEntClass)**

Similar to `CanReadOutgoingEdge` above, but delegates the check to the parent Ent's `privacyUpdate` rules.

#### **new** [**CanDeleteOutgoingEdge**](https://github.com/clickup/ent-framework/blob/main/src/ent/predicates/CanDeleteOutgoingEdge.ts)**(field, ToEntClass)**

Same as `CanUpdateOutgoingEdge`, but for `privacyDelete` delegation to the parent Ent.

#### **new** [**IncomingEdgeFromVCExists**](https://github.com/clickup/ent-framework/blob/main/src/ent/predicates/IncomingEdgeFromVCExists.ts)**(EntEdge, entEdgeVCField, entEdgeFKField, entEdgeFilter?)**

Checks that there is a **child** Ent in the graph (`EntEdge`) that points to both  `vc.principal` and to our current Ent. In other words, checks that there is a direct junction Ent sitting in between the VC and our current Ent. Optionally, you can provide an `entEdgeFilter` callback which is fed with that junction Ent (of `EntEdge` class) and should return true or false for filtering purposes.

Imagine you have `EntUser` and `EntOrganization` Ents, and also `EntEmployment` junction Ent with `(organization_id, user_id)` field edges (foreign keys). You want to check that some `EntOrganization` is readable by a VC:

```typescript
const employmentsSchema = new PgSchema(
  "employments",
  {
    id: { type: ID, autoInsert: "nextval('employments_id_seq')" },
    organization_id: { type: ID },
    user_id: { type: ID },
  },
  ["organization_id", "user_id"],
);

export class EntEmployment extends BaseEnt(cluster, employmentsSchema) {
  ...
}

...

export class EntOrgainzation extends BaseEnt(cluster, organizationsSchema) {
  static override configure() {
    return new this.Configuration({
      privacyLoad: [
        new AllowIf(
          new IncomingEdgeFromVCExists(
            EntEmployment,     // junction Ent
            "user_id",         // points to vc.principal
            "organization_id", // ponts to this.id
          ),
        ),
      ],
      ...
    });
  }
}
```

You use `IncomingEdgeFromVCExists` just once in `EntOrganization`, and then for all other children Ents, you delegate permission checks to their parent organization, using `OutgoingEdgePointsToVC` typically.

#### new [Or](https://github.com/clickup/ent-framework/blob/main/src/ent/predicates/Or.ts)(predicate1, predicate2, ...)

This is a composite predicate, allowing to call other predicates in pallel. It returns true if any of the predicates returned true and no predicates threw an error.

Notice that you likely don't need this predicate when working with `privacyLoad`, since it's typically a chain of `AllowIf` rules. The `AllowIf` rule already works in an "or-fashion". But for `privacyUpdate/Delete` rules, the `Or` predicate may be useful (`Require` rule is "and-ish" on its nature).

#### new [VCHasFlavor](https://github.com/clickup/ent-framework/blob/main/src/ent/predicates/VCHasFlavor.ts)(FlaviorClass)

This predicate returns true if there is flavor of a particular class added to the acting VC.

Flavors will be discussed later in details. For now, we can just mentioned that it's some kind of a "flag" which can be added to a VC instance for later rechecking or to carry some auxiliary information (more precisely, you can derive a new VC with a flavor added to it, since VC itself is an immutable object).

A very common case is to define your own `VCAdmin` flavor which is added to a VC very early in the request cycle with `vc = vc.withFlavor(new VCAdmin())`, when the corresponding user is an admin and can see any data in the database. Then, in `privacyLoad/Insert/Update/Delete` of the Ent classes, you can add `new AllowIf(new VCHasFlavor(VCAdmin))` to allow an admin to read that Ent unconditionally.
