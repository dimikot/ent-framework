# Abstraction Layers

<figure><img src="../.gitbook/assets/image (6).png" alt=""><figcaption></figcaption></figure>

Ent Framework consists of 3 abstraction layers:

1. **Discovery & Connectivity Layer.** Includes such abstractions as Cluster, Island, Shard. Automatically detects changes in the cluster configuration and applies them (e.g. when a Shard is moved from one Island to another; when a new Node becomes available; when a replica is promoted to master or vice versa).
2. **Low-Level Queries Layer.** At this layer, low-level underlying DB driver features (such as connection pool or being able to send a raw SQL query) are exposed. Also, this layer provides services to the next abstraction, like building batched SQL queries or exposing replication lag tracking APIs.
3. **Ent API Layer.** Allows to define Ent classes with privacy rules, triggers, methods, composite fields. It also exposes an ORM-like query language in TypeScript, plus orchestrates parallel-executing queries batching and query caching.
