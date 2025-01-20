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
