# Privacy Rules

A crucial reason on why Ent Framework exists at all is its privacy layer. No data exits the API unless it's rechecked against a set of explicitly defined security predicates. In other words, when you have multiple users in your service, you can enforce the strict guarantees that one user can't see other user's data even in theory.

In relational databases world, this concept is called "rowl-level security".&#x20;

## Disadvantages of PostgreSQL Built-in Row Level Security

We need to mention that some support for row-level security is [built in to PostgreSQL](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), but it has several drawbacks which makes it almost useless in web develpment:

1. It is expensive and, at the same time, too "sloppy" and low-level (the amount of DDL code you need to write is large, and there is no framework in place to help you with it).
2. There is no support for "per-transaction variables" in PostgreSQL (no per-session variables as well), so if you want to pass an "acting user ID" (similar to Ent Framework VC's Principal), other than the database DDL user/role, into the query, then you can't.
3. PostgreSQL doesnt't support microsharding, so you basically can't recheck security against the data living in a different microshard.

## How Ent Framework Privacy Rules Work

In each Ent class, you need to define an explicit set of rules which determine, can a VC read that Ent, create an new Ent, update the Ent and delete the Ent:

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

When you run e.g. `EntComment.loadX(vc, "123")` (or any other API call, like `loadBy*()` or `select()`), Ent Framework runs `privacyLoad` rules for each Ent.

Typically, a **Rule** class used in `privacyLoad` is `AllowIf`: it allows reading the Ent immediately as soon as the **Predicate** passed to it succeeds. There are several pre-defined Predicate classes, and you can also create your own predicates or just pass an async boolean function; we'll discuss it a bit later.

So, the logic in the example is following:

1. `new OutgoingEdgePointsToVC("creator_id")`: if `vc.principal` equals to `comment.creator_id`, then the read is immediately allowed. Which means that you (`vc`) are trying to read a commend which you created (its `creator_id` is your user ID).
2. `new CanReadOutgoingEdge("topic_id", EntTopic)`:  if `vc.principal` is able to run `EntTopic.loadX(vc, comment.topic_id)` successfully, then reading of the comment is immediately allowed. This is an extremely powerful construction, the essence of Ent Framework's privacy layer: you can **delegate** privacy checks to other Ents in the graph. And since the engine does batching and caching aggressively, this all will be performance efficient.

Idiomatically, `privacyLoad` defines access permissions in terms of **graph edges reachability**: typically, if there is **at least one** path in the graph originating from a VC and ending at the target Ent, then this VC is allowed to read this Ent.

### privacyInsert and Referential Permissions

As opposed to `privacyLoad`, where a single succeeded rule allows the read, for `privacyInsert` (as well as `privacyUpdate` and `privacyDelete`), **all of them** must pass typically.

This is because the ability to insert an Ent means that the VC has permissions to reference other Ents in **all** field edges. Typically, for every field edge (foreign key) defined in the Ent, there should be at least one associated **Require** privacy rule.

In other words, having permissions to insert an Ent is almost always the same as having permissions to reference other Ents in its foreign key fields. If we forget to check some of the field edges, then it is possible that the user will be able to create an Ent "belonging" to someone else (by e.g. referencing someone else's ID).

The logic in the example above:

1. `new Require(new OutgoingEdgePointsToVC("creator_id"))`: it is **required** that the value of `comment.creator_id` is equal to `vc.principal`. I.e. you can only reference yourself as a creator of the just inserted comment.
2. `new Require(new CanReadOutgoingEdge("topic_id", EntTopic))`: it is **required** that, to create a comment in some topic, you must have at least read access to that topic. I.e. you can create comments in someone else's topics too, as soon as you can read them.

Notice that here we again use delegation: instead of introducing complicated boilerplate in comments privacy rules, we say: "I fully trust the way how privacy is implemented at EntTopic, and I don't want to know details about it at EntComment level". Basically, you build a "chain of trust".

## Custom Privacy Predicates

Each item in `privacyLoad`, `privacyInsert` etc. arrays is called a **Rule**. Each Rule instance is parametrized with a boolean **Predicate**. There are several built-in Rules:

* `new AllowIf(predicate)`: &#x20;


