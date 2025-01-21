# Connect to a Database

To start simple, create a PostgreSQL database and several tables there. You can also use you existing database:

```bash
$ psql postgresql://postgres:postgres@127.0.0.1/postgres -f ents/cluster.sql
```

{% code title="ents/cluster.sql" %}
```sql
CREATE TABLE users(
  id bigserial PRIMARY KEY,
  email varchar(256) NOT NULL UNIQUE,
  is_admin boolean NOT NULL DEFAULT FALSE
);

CREATE TABLE topics(
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  slug varchar(64) NOT NULL UNIQUE,
  creator_id bigint NOT NULL,
  subject text DEFAULT NULL
);

CREATE TABLE comments(
  id bigserial PRIMARY KEY,
  created_at timestamptz NOT NULL,
  topic_id bigint REFERENCES topics,
  creator_id bigint NOT NULL,
  message text NOT NULL
);

CREATE TABLE organizations(
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE organization_users(
  id bigserial PRIMARY KEY,
  organization_id bigint REFERENCES organizations,
  user_id bigint REFERENCES users,
  UNIQUE (organization_id, user_id)
);
```
{% endcode %}

To access that database, create an instance of Cluster:

{% code title="ents/cluster.ts" fullWidth="false" %}
```typescript
import { Cluster } from "ent-framework";
import type { PgClientPoolOptions } from "ent-framework/pg";
import { PgClientPool } from "ent-framework/pg";
import type { PoolConfig } from "pg";

export const cluster = new Cluster<PgClientPool, PgClientPoolOptions>({
  islands: () => [
    {
      no: 0,
      nodes: [
        {
          name: "island0-master",
          config: {
            connectionString: process.env.DATABASE_URL, // e.g. from .env
            // This object is of the standard node-postgres type PoolConfig.
            // Thus, you can use host, port, user, password, database and other
            // properties instead of connectionString if you want.
            min: 5,
            max: 20,
          } satisfies PoolConfig,
        },
      ],
    },
  ],
  createClient: (node) => new PgClientPool(node),
  loggers: {
    clientQueryLogger: (props) => console.debug(props.msg),
    swallowedErrorLogger: (props) => console.log(props),
  },
});

// Pre-open min number of DB connections.
cluster.prewarm();
```
{% endcode %}

Terminology:

1. **Cluster** consists of **Islands**. Each Island is identified by an integer number (there can be many islands for horizontal scaling of the cluster).
2. Island consists of master + replica **nodes** (in the above example, we only define one master node and no replicas).&#x20;
3. Island also hosts **Microshards** (in the example above, we will have no microshards, aka just one global shard). Microshards may travel from island to island during shards rebalancing process; the engine tracks this automatically ("shards discovery").

Notice that we define the layout of the cluster using a callback. Ent Framework will call it from time to time to refresh the view of the cluster, so in this callback, you can read the data from some centralized configuration database (new nodes may be added, or empty nodes may be removed with no downtime). This is called "dynamic real-time reconfiguration".

[PgClientPool](https://github.com/clickup/ent-framework/blob/main/docs/classes/PgClientPool.md) class accepts several options, one of them is the standard [node-postgres PoolConfig](https://node-postgres.com/apis/pool) interface. For simplicity, when we define a cluster shape in `islands`, we just return a list of such configs, to be passed into `createClient()` lambda.

As of `prewarm()` call, it's explained in Advanced section.
