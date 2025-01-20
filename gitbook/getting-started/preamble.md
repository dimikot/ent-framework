# Code Structure

Below, we'll show some Ent Framework usage examples. We will progress from the simplest code snippets to more and more advanced topics, like:

* custom ID schemas
* privacy rules
* triggers
* composite field types
* Viewer Context flavors
* master-replica and automatic replication lag tracking
* microsharding and migrations
* cross-shards foreign keys and inverse indexes
* etc.

### Code Structure

The examples in this tutorial will approximately follow [examles/next-example](https://github.com/dimikot/ent-framework/tree/main/examples/next-example) `src` folder structure:

* ents/
  * cluster.sql
  * cluster.ts
  * EntComment.ts
  * EntTopic.ts
  * EntUser.ts
  * getServerVC.ts
* app/
  * api/
    * auth/\[...nextauth]
      * route.ts
    * topics/
      * route.ts
