# Passwords Rotation

If your company is regularly passing through some security audit (like SOC2), you must know, how painful it is to rotate database passwords and keep the service off downtime at the same time.

The idea of passwords rotation is that, at any given moment of time, there should exist 2 login+password pairs in the database ("previous" and "current"), both working. When you want to change the password, you set the new one in the "previous" login, and then exchange them. At the app's boot time, it always uses the "current" login+password pair.

Alternatively, you may have just 1 login, but then you still have the "previous" and the "current" passwords for it. The app needs to be able to probe both: in case one password stopped working, then it must quickly reconnect using another one.

Ent Framework supports both models:

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

If the engine sees that there are more than 1 islands in the cluster having the same name, it will probe all connection parameters for them sequentially, until it finds the working ones. Then, it will remember, which island is best, so next time a reconnect happens, it will start the probing from it (and most likely, it'll immediately hit the success).

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
  },
}
```

Here, we define 3 islands with 2 PostgreSQL nodes in each (one master and one replica; Ent Framework will decide on its own, what is which). We also define several login+password pairs to probe. The tool that is used to rotate the password must guarantee that at any given time, at least 1 login+password pair in this list is working.

Given that config structure, let's build an Ent Framework Cluster instance:

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
