# Table of contents

* [Ent Framework](README.md)

## Getting Started

* [Code Structure](getting-started/preamble.md)
* [Connect to a Database](getting-started/connect-to-a-database.md)
* [Create Ent Classes](getting-started/create-ent-classes.md)
* [VC: Viewer Context and Principal](getting-started/vc-viewer-context-and-principal.md)
* [Ent API: insert\*()](getting-started/ent-api-insert.md)
* [Built-in Field Types](getting-started/built-in-field-types.md)
* [Ent API: load\*() by ID](getting-started/ent-api-load-by-id.md)
* [N+1 Selects Solution](getting-started/n+1-selects-solution.md)
* [Automatic Batching Examples](getting-started/automatic-batching-examples.md)
* [Ent API: select() by Expression](getting-started/ent-api-select-by-expression.md)
* [Ent API: loadBy\*() Unique Key](getting-started/ent-api-loadby-unique-key.md)
* [Ent API: update\*()](getting-started/ent-api-update.md)
* [Ent API: deleteOriginal()](getting-started/ent-api-deleteoriginal.md)
* [Ent API: count() by Expression](getting-started/ent-api-count-by-expression.md)
* [Ent API: exists() by Expression](getting-started/ent-api-exists-by-expression.md)
* [Ent API: selectBy() Unique Key Prefix](getting-started/ent-api-selectby-unique-key-prefix.md)
* [Ent API: upsert\*()](getting-started/ent-api-upsert.md)
* [Privacy Rules](getting-started/privacy-rules.md)
* [Validators](getting-started/validators.md)
* [Triggers](getting-started/triggers.md)
* [Custom Field Types](getting-started/custom-field-types.md)

***

* [Ent API: Configuration and Types](ent-api-configuration-and-types.md)

## Scalability

* [Replication and Automatic Lag Tracking](scalability/replication-and-automatic-lag-tracking.md)
* [Sharding and Microsharding](scalability/sharding-microsharding.md)
* [Sharding Terminology](scalability/sharding-terminology.md)
* [Locating a Shard and ID Format](scalability/locating-a-shard-id-format.md)
* [Sharding Low-Level API](scalability/sharding-low-level-api.md)
* [Shard Affinity and Ent Colocation](scalability/shard-affinity-ent-colocation.md)
* [Inverses and Cross Shard Foreign Keys](scalability/inverses-cross-shard-foreign-keys.md)
* [Shards Rebalancing and pg-microsharding Tool](scalability/shards-rebalancing-and-pg-microsharding-tool.md)
* [Connection Pooling](scalability/connection-pooling.md)

## Advanced

* [Database Migrations and pg-mig Tool](advanced/database-schema-migrations.md)
* [Ephemeral (Symbol) Fields](advanced/ephemeral-symbol-fields.md)
* [Atomic Updates and CAS](advanced/atomic-updates-and-cas.md)
* [Custom Field Refactoring](advanced/custom-field-refactoring.md)
* [VC Flavors](advanced/vc-flavors.md)
* [Query Cache and VC Caches](advanced/query-and-custom-caches.md)
* [Loaders and Custom Batching](advanced/loaders-and-custom-batching.md)
* [PostgreSQL Specific Features](advanced/postgresql-specific-features.md)
* [Query Planner Hints](advanced/query-planner-hints.md)
* [Cluster Maintenance Queries](advanced/cluster-maintenance-queries.md)
* [Logging and Diagnostic Tools](advanced/logging-and-diagnostic-tools.md)
* [Composite Primary Keys](advanced/composite-primary-keys.md)
* [Passwords Rotation](advanced/passwords-rotation.md)

## Architecture

* [Abstraction Layers](architecture/abstraction-layers.md)
* [Ent Framework, Meta’s TAO, entgo](architecture/ent-framework-metas-tao-entgo.md)
* [JIT in SQL Queries Batching](architecture/jit-in-sql-queries-batching.md)
* [To JOIN or not to JOIN](architecture/to-join-or-not-to-join.md)
