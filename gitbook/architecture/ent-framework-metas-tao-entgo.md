# Ent Framework, Meta’s TAO, entgo

At this point, it’s time to discuss the origins of Ent Framework, how it came to be, and what it has evolved from.

The name "Ent Framework" originated at Meta (formerly Facebook), where it was used for an internal storage service. Since then, it has been referenced in numerous public articles across the Internet.

At Facebook, Ent Framework was primarily a query language layer built on top of another storage service called [TAO](https://engineering.fb.com/2013/06/25/core-infra/tao-the-power-of-the-graph/) which stands for "The Associations and Objects".&#x20;

## Meta's TAO

TAO provides a very low-level API for interacting with a graph. The nodes in this graph are called **Objects**, while the edges are referred to as **Assocs** (associations).

Each Object in TAO has a globally unique ID and can contain an arbitrary number of named fields. For simplicity, you can think of it like a JSON object with an ID. The fields themselves are opaque to TAO, meaning it always operates on the Object as a whole. For example, if you load an Object by its ID, you retrieve all of its attributes at once. This is also how an Object is stored—in a key-value-like table, where the key is the ID, and the value is a serialized blob containing all the fields.

As for what an Assoc is, it’s simply a pair of IDs (referred to as id1 and id2, representing the “source” and “destination” Objects). Assocs represent unidirectional edges in the graph, essentially defining an “arrow” from one Object to another. They are stored in a regular table with columns (id1, id2). In reality, this table also includes a timestamp column, and you can define a small number of “custom fields” for each Assoc, stored as a serialized blob.

There is exactly one compound index defined on this table: (id1, timestamp), which allows for fast selection of all Assocs originating from the same id1, ordered by timestamp.

When it comes to sharding, Objects are distributed across multiple shards, and the ID of an Object is sufficient to determine which shard it belongs to. Similarly, Assocs are sharded by their id1, meaning that for a given id1, you can quickly load all the id2s that are pointed to by a particular Assoc type. All these Assocs will reside in the same shard as id1.

These are essentially all the core primitives relevant to the scope of this article. (There are a few additional features, such as Assoc Counters, which allow you to track the number of id2s for a given id1 of a particular Assoc type, and Keys, which enable finding Objects by unique strings instead of IDs, but those details are beyond the scope here.)

By nature, Assocs are unidirectional. Even though each Assoc has both id1 and id2, you can only fetch them by id1 due to shard colocation based on id1. Now, imagine you wanted to load all Assocs where id2 equals a specific value. How would you identify all the shards that store those Assocs? Since they would be spread across different shards, and the number of involved shards would likely be too large to query efficiently, this becomes impractical.

This is why, in many cases, instead of just creating one Assoc between a pair of Objects, two are used: one from ObjectA.id to ObjectB.id and another from ObjectB.id to ObjectA.id. This way, establishing a relationship between ObjectA and ObjectB results in two Assoc inserts, in two different shards, allowing traversal of the bi-directional edge in both directions.

The opposite Assoc for a “forward” Assoc is called an “inverse Assoc” in TAO. There is a large infrastructure dedicated to keeping inverse Assocs in sync with "forward" Assocs and "field edges". This includes things like "assoc fixers", a distributed crawler that ensures data integrity, and a system that subscribes to the Write-Ahead Log (WAL) of databases to replay forward Assoc creations in order to create inverse Assocs, and similarly, handle deletions. Since there are no transactions possible across multiple shards, and forward and inverse Assocs naturally live in different shards, this synchronization is crucial.

**In fact, the main reason for the existence of inverse Assocs is that related Objects may live in different shards.** Without sharding, we could simply query the Assocs table by id2. Keep this idea in mind.

## What TypeScript’s Ent Framework Does Differently

Although the TypeScript Ent Framework discussed in this tutorial shares the same name as Meta’s engine, it handles many aspects quite differently.

### No Intermediate Layer Like TAO

The main difference is that the TypeScript Ent Framework doesn’t rely on a lower-level abstraction like TAO; instead, it directly interacts with relational database tables. Ent Framework doesn’t try to obscure the underlying database mechanics (like PostgreSQL internals). It doesn’t generate DDL or manage schema migrations, nor does it create indexes. Instead, it works directly with relational databases (such as PostgreSQL), where an Ent corresponds to a table and fields map to columns, without the need for an intermediate layer like TAO.

This approach is based on the observation that modern databases are feature-rich enough to eliminate the need for an intermediate layer. They also don’t require object field serialization for storage, since `ALTER TABLE` DDL queries are fast (e.g. adding or removing a column is cheap even on large tables; indexes creation is also cheap and can be done without blocking writes on a table).

### No Explicit Assocs

Comparing to Meta’s TAO, each Object (Ent Framework’s Ent) corresponds to a row in a table with the same name, and each Assoc (more precisely, each field edge) is represented as a column (foreign key field) in that table. What’s different it that inverse Assocs are just _indexes_ on the relevant fields, automatically managed by the database, plus _something else_.

This “something else” is an **Inverse**: a record similar to an inverse Assoc in TAO, but instead of storing an (id1, id2) pair, it stores an (id1, shard2) pair.

To understand it better, consider an example:&#x20;

* EntTopic(id, title): conversation topics
* EntComment(id, topic\_id, text): comments of a particular topic
* All EntComment Ents live in different microshards

In the microshard which holds EntTopic with id=topic\_id, there is an `inverses` table, which effectively stores (topic\_id, shard\_of\_comment) records. Ent Framework automatically keeps this table up to date each time a new EntComment is inserted.

Now assume that we want to load all EntComment objects for a particular topic ID:

<pre class="language-typescript"><code class="lang-typescript"><strong>await EntComment.select(vc, { topic_id: "123" }, 1000);
</strong></code></pre>

Ent Framework first loads the list of microshards where EntComment with the particular value of topic\_id reside; to do so, it uses the Inverses table in the microshard of the corresponding EntTopic:

```sql
SELECT shard FROM inverses WHERE id1='123' AND type='topic2comments';
```

Then, having the list of microshards, Ent Framework queries them all for all EntComment records and merges the results:

```sql
run_on_each_microshard_in_parallel {
  SELECT * FROM comments WHERE topic_id='123' LIMIT 1000;
}
```

Those last queries use an index on `topic_id` of course, ensuring the operation is efficient within each microshard.

In other words, Ent Framework simplifies the concept of Assocs by only storing information about the destination shards, rather than the destination id2s of a relationship. So, Inverses and database indexes work in tandem to help you load the data from multiple microshards.

The motivation here is that representing edges in a graph using an artificial Assoc concept is often unnecessary and too complex for most people, who are accustomed to edges being represented by standard relational table fields. The only small exception is the use of Inverses, which must be defined explicitly. However, their role is quite different: instead of pointing directly to an Ent on the other side of an edge, Inverses serve as _hints_ to the engine about which microshards might contain those Ents. In this sense, Inverses are completely hidden from the user when making `select()` calls to Ent Framework and are used purely to _query only a smaller subset of microshards_, not all of them. In other words, Inverses are treated as a performance optimization, so you don’t need to think much about edges—since, for the most part, edges are just regular table fields.

### Junction Ents vs. TAO Assocs

Here’s an important observation regarding “many-to-many” relationships. In classical relational databases, these relationships are represented using “junction tables.” For example, if you have User and Group objects, where users can belong to many groups and groups can have many users, you would define an additional table (e.g., Membership) with user\_id and group\_id columns. This table, along with regular foreign keys and constraints, expresses the relationship.

This schema is straightforward and easily understood by most people. The junction table typically has a clear noun meaning, and it can also include extra columns (like a timestamp or “friendship type”). So, it makes perfect sense to represent it as an EntMembership in Ent Framework as well. In contrast, in TAO, entgo, or Meta’s Ent Framework, that relationship would be modeled with “an Assoc with extra attributes and an inverse Assoc”, which adds complexity. Moreover, this Assoc isn’t just a regular one—it has additional custom fields, which starts to resemble an Object itself. This can feel like a leaking abstraction, and Ent Framework simplifies that.

As a result, Ent Framework imposes a constraint on the abstract data graph: there are no direct “many-to-many” edges:\


<figure><img src="../.gitbook/assets/image (7).png" alt="" width="375"><figcaption><p>There is no such thing...</p></figcaption></figure>

Instead, the only type of edges are “many-to-one”. When a “many-to-many” relationship is needed, an intermediate junction node (like EntMembership) is required:

<figure><img src="../.gitbook/assets/image (9).png" alt="" width="563"><figcaption><p>...This is what it we do instead</p></figcaption></figure>

Notice that "one to one" and "at most one to one" special cases are treated as special cases of "many to one" with unique index.

### No 9 Kinds of Edges as in entgo, Since There are no Assocs

If you read [entgo's docs about edges](https://entgo.io/docs/schema-edges/), you probably noticed that **entgo has 9 types of edges**.&#x20;

In Ent Framework, edges in the graph are basically just foreign key fields on Ents (with optional Inverses maintained automatically when needed). So, it is much simpler.

### Ent Framework and entgo

[Entgo](https://entgo.io) is, as it’s stated on the website, “An entity framework for Go. Simple, yet powerful ORM for modeling and querying data”.  It is a library developed and open-sourced by Meta.

It is not the same as Meta’s Ent Framework though:

1. entgo is in Go, whilst Meta’s Ent Framework is in Hack
2. entgo does not support sharding, deferring it to the underlying database layer at best
3. there is nothing much about automatic replication lag tracking in entgo
4. no batching for the underlying SQL queries (i.e. no solution for “N+1 Select” problem)
5. despite being open-sourced, entgo is not used actively in Meta, which is very different with Meta’s Ent Framework, backing the entire facebook.com service

So all in all, entgo is mostly an ORM-like wrapping library around a single database instance (e.g. PostgreSQL), with no attempts to do horizontal or vertical scaling.

Thus, it is not quite correct to compare TypeScript Ent Framework described here with entgo: the more straight analogy would be ”it’s like a Meta’s Ent Framework, but without TAO and explicit assocs”.\


\
\
