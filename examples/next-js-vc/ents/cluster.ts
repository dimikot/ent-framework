import { Cluster } from "ent-framework";
import { PgClientPool } from "ent-framework/pg";

export const cluster = new Cluster({
  islands: () => [
    {
      no: 0,
      nodes: [
        {
          name: "island0-master",
          host: "127.0.0.1",
          port: parseInt(process.env.PGPORT || "5432"),
          user: "postgres",
          password: "postgres",
          database: "postgres",
          min: 5,
          max: 20,
        },
      ],
    },
  ],
  createClient: ({ name, ...config }) => new PgClientPool({ name, config }),
  loggers: {
    clientQueryLogger: (props) => console.debug(props),
    swallowedErrorLogger: (props) => console.log(props),
  },
});

// Pre-open min number of DB connections.
setTimeout(() => cluster.prewarm(), 100);
