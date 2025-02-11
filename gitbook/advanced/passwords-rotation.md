# Passwords Rotation

If your company regularly undergoes security audits (like SOC 2), you know how challenging it is to rotate database passwords while keeping the service running without downtime.

The goal of password rotation is to ensure that, at any given time, two login-password pairs exist in the database—"previous" and "current"—both functional. When rotating the password, you assign the new password to the "previous" login and then swap them. On startup, the app always uses the "current" login-password pair.

Alternatively, you can use a single login while maintaining "previous" and "current" passwords for it. The app must be able to check both passwords and, if one stops working, quickly reconnect using the other. This approach would only work if your connection pooler (like PgBouncer) uses a "pass-through" mode (see [auth\_query](https://www.pgbouncer.org/config.html#auth_query) feature) and doesn't have a separate userlist.txt config with login-password pairs (otherwise, it's impossible to update the password for the same login transactionally and simultaneously in multiple places).

Ent Framework supports both approaches:

```typescript
import type { PoolConfig } from "pg";

export const cluster = new Cluster<PgClientPool, PgClientPoolOptions>({
  islands: () => [
    {
      no: 0,
      nodes: [
        {
          name: "island0-master",
          config: {
            connectionString: myConfig.DATABASE_URL_1,
            ...,
          } satisfies PoolConfig,
        },
        {
          name: "island0-master", // same name!
          config: {
            connectionString: myConfig.DATABASE_URL_2,
            ...,
          } satisfies PoolConfig,
        },
        ...,
      ],
    },
  ],
  createClient: (node) => new PgClientPool(node),
  ...,
});
```

If the engine sees that there are more than one island in the cluster having the same name, it will probe all connection config for the duplicates sequentially, until it finds the working one. Then, it will remember, which config is best, so next time a reconnect happens, it will start the probing from it (and most likely, it'll immediately hit the success).

## Config Hot Reloading

Unlikely your real code will look like the above example though. You'll probably want to iterate over some array in your hot-reloadable config instead of hardcoding `DATABASE_URL_1`, `DATABASE_URL_2` etc.

Consider that in your app, you have a `config` object looking like this:

```typescript
config = {
  islands: [
    ["postgres://pg-001a/database", "postgres://pg-001b/database"],
    ["postgres://pg-002a/database", "postgres://pg-002b/database"],
    ["postgres://pg-003a/database", "postgres://pg-003b/database"],
    ...
  ],
  secrets: [
    { login: "app_20380902123218", password: "<password1>" },
    { login: "app_20381002121152", password: "<password2>" },
    // Can also be the same login, but typically, you rotate
    // BOTH login and password, such that the passwords for
    // the existing logins are immutable.
  },
}
```

Here, we define 3 islands with 2 PostgreSQL nodes on each (one master and one replica; Ent Framework will decide on its own, which is what). We also define several login+password pairs to probe. The tool that you use to rotate the password must guarantee that at any given time, at least 1 login+password pair in this list is working.

Given the config structure above, let's build an Ent Framework `Cluster` instance:

```typescript
import type { PoolConfig } from "
import { config } from "./config";

export const cluster = new Cluster({
  islands: () => config.islands.map((islandNodes, no) => ({
    no,
    nodes: islandNodes.flatMap((connectionString) =>
      config.secrets.map((secret) => ({
        name: connectionString,
        config: {
          connectionString,
          user: secret.login,
          password: secret.password,
          ...,
        } satisfies PoolConfig,
      }))
    )
  })),
  createClient: (node) => new PgClientPool(node),
  ...,
});
```

And now the main part: the values in `config` object don't have to be constant! Notice that `islands` property in `Cluster` constructor options accepts a callback. This callback is run by Ent Framework from time to time to pull the most up-to-date cluster configuration.

You can have a background code that reloads the config properties from some service(s) periodically:

```typescript
setInterval(async () => {
  config.islands = await enumerateFromAWSParameterStore();
  config.secrers = await enumerateAndLoadFromAWSSecretsManager();
}, 10000);
// In real code, you'll likely want some logging and try-catch around.
```

This way, you can dynamically change the cluster topology and rotate passwords without downtime or even app reloading.
