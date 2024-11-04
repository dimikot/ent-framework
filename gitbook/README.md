---
layout:
  title:
    visible: false
  description:
    visible: true
  tableOfContents:
    visible: false
  outline:
    visible: false
  pagination:
    visible: true
---

# Ent Framework

<div align="left">

<figure><img src=".gitbook/assets/logo-berkshire-swash.svg" alt="" width="375"><figcaption></figcaption></figure>

</div>

The TypeScript library for working with microsharded PostgreSQL databases.

* [Getting Started and Tutorials](https://ent-framework.net)
* [API documentation](https://github.com/clickup/ent-framework/blob/master/docs/modules.md)
* [Source code](https://github.com/clickup/ent-framework)
* [Ent Framework's Discord](https://discord.gg/QXvN6VTCKS)

#### Core Features

1. **Graph-like representation of entities.** With Ent Framework, you represent each Ent (a domain object of your business logic) as a TypeScript class with immutable properties. An Ent class instance maps to one row of some table in a relational database (like PostgreSQL). It may look similar to ORM, but has many aspects that traditional ORMs don't have.
2. **Row-level security in a graph (privacy layer).** You manage data as a graph where each node is an Ent instance, and each edge is a field link (think of foreign keys) to other Ents. To be allowed to read (or update/delete) some Ent, you define a set of explicit rules like "user can read EntA if they can read EntB or EntC". And, consequently, in EntB you define its own set of rules, like "user can read EntB if they can read EntD".
3. **Query batching and coalescing.** Ent Framework holistically solves the "N+1 selects" problem commonly known in ORM world. You still write you code as if you work with individual Ents and individual IDs, and the framework magically takes care of sending batched requests (both read and write) to the underlying relational database. You do not work with lists and JOINs anymore.
4. **Microsharding and replication lag tracking support out of the box.** Splitting your database horizontally is like a breeze now: Ent Framework takes care of routing the requests to the proper microshards. When scaling reads, Ent Framework knows whether a node is "good enough" for that particular query. It automatically uses that replica when possible, falling back to master when not.
5. **Pluggable to your existing relational database.** If your project already uses some ORM or runs raw SQL queries, Ent Framework can be plugged in.
6. **Tens of other features.** Some examples: cross-microshards foreign keys, composite fields, triggers, build-in caching etc.

#### Installation

```
npm add ent-framework
pnpm add ent-framework
yarn add ent-framework
```

<div align="left">

<figure><img src="https://github.com/clickup/ent-framework/actions/workflows/ci.yml/badge.svg?branch=main" alt="" width="188"><figcaption></figcaption></figure>

</div>
