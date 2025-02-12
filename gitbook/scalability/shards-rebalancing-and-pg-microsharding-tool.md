# Shards Rebalancing and pg-microsharding Tool

Ent Framework by itself does not include a tool that allows to create new microshards or move them from one island to another. As we earlier discussed in [locating-a-shard-id-format.md](locating-a-shard-id-format.md "mention"), for the engine, a microshard is just a PostgreSQL schema located on some island. You, as a user, define the naming convention to be used for such schemas:

```typescript
export const cluster = new Cluster({
  shards: {
    nameFormat: "sh%04d",
    discoverQuery:
      "SELECT nspname FROM pg_namespace WHERE nspname ~ 'sh[0-9]+'",
  },
  ...
});
```

The above means that your microshard schemas are named like `sh0000`, `sh0123` etc., and also you provided a query that enumerates all microshard schemas available on a particular island.

To manage the actual schemas, an external tool needs to be used.

Below is the README content of [pg-microsharding](https://www.npmjs.com/package/@clickup/pg-microsharding) tool.

## pg-microsharding: Microshards Support for PostgreSQL

See also [TypeScript API documentation](https://github.com/clickup/pg-microsharding/blob/master/docs/globals.md).

[![CI run](https://github.com/clickup/pg-microsharding/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/clickup/pg-microsharding/actions/workflows/ci.yml/badge.svg?branch=main)

The [pg-microsharding](https://www.npmjs.com/package/@clickup/pg-microsharding) CLI tool enables microshard schemas management across multiple PostgreSQL servers. You can do the following:

* Add and remove microshard schemas.
* Activate and deactivate schemas.
* Enumerate active microshard schemas.
* View the entire cluster layout: what microshard schemas are where, of what size, and how many reads/writes do the experience.
* Move a microshard from one PostgreSQL server to another with no downtime.
* Automatically rebalance microshards among multiple servers, so that each server will become of approximately the same size.
* Weighted rebalancing: when one server looks overloaded, you can "dissolve out" some shards from it to other servers to achieve equal load.

Each microshard is a PostgreSQL schema with numeric suffix. Microshard schemas have the same set of tables with same names; it's up to the higher-level tools to keep the schemas of all those tables in sync (e.g. see [pg-mig](https://www.npmjs.com/package/@clickup/pg-mig) tool).

## Usage

```
pg-microsharding list | ls
  [--weight-sql='SELECT returning weight with optional unit']
  [--verbose]
  [--dsn=DSN | --dsns=DNS1,DSN2,...]

pg-microsharding allocate
  --shard=N | --shards=N-M
  --migrate-cmd='shell command to run migrations'
  --activate={yes | no}
  [--dsn=DSN | --dsns=DNS1,DSN2,...]

pg-microsharding factor
  --shard=N | --shards=N,M,... | --shards=DSN-PREFIX
  --factor=P|+P.Q|-P.Q|"*P.Q"
  [--dsn=DSN | --dsns=DNS1,DSN2,...]

pg-microsharding move
  --shard=N
  --from=DSN
  --to=DSN
  --activate-on-destination={yes | no}
  [--deactivate-sql='SQL $1 SQL']

pg-microsharding rebalance
  --activate-on-destination={yes | no}
  [--deactivate-sql='SQL $1 SQL']
  [--weight-sql='SELECT returning weight with optional unit']
  [--decommission=DSN1,DSN2,...]
  [--parallelism=N]
  [--dsn=DSN | --dsns=DNS1,DSN2,...]

pg-microsharding cleanup
  [--dsn=DSN | --dsns=DNS1,DSN2,...]
```

## Environment Variables

The tool receives parameters from command line option, but allows to set defaults for most of them using environment variables.

Some variables are standard for psql command:

* `PGUSER`: default database user
* `PGPASSWORD`: default database password
* `PGHOST`: default database host (or multiple hosts, comma-separated)
* `PGPORT`: default database port
* `PGDATABASE`: default database name
* `PGSSLMODE`: default SSL mode (e.g. "prefer")

Custom variables of the tool itself:

* `DSNS` or `PGDSNS` or `PGHOST`: default value for `--dsns` option, comma-separated list of DSNs (see below)
* `MIGRATE_CMD`: default value for `--migrate-cmd` option
* `WEIGHT_SQL`: default value for `--weight-sql` option
* `DEACTIVATE_SQL`: default value for `--deactivate-sql` option

## Configuration File: pg-microsharding.config.ts

Instead of setting the environment variables, you can export the same exact values in `pg-microsharding.config.ts` file by e.g. deriving them directly from the [Ent Framework](https://ent-framework.org/) cluster configuration:

```javascript
import { cluster } from "ents/cluster";

export default async function(action: "apply" | "undo" | string) {
  const islands = cluster.options.islands();
  return {
    PGDSNS: islands
      .map((island) => island.nodes.map(({ host }) => host)
      .flat()
      .join(","),
    PGPORT: 5432, // we don't want to use pgbouncer port here
    PGUSER: firstNode.user,
    PGPASSWORD: firstNode.password,
    PGDATABASE: firstNode.database,
    PGSSLMODE: firstNode.ssl ? "prefer" : undefined,
    MIGRATE_CMD: "yarn -s pg-mig",
  };
}
```

The file `pg-microsharding.config.ts` is searched in all parent folders starting from the current working directory when `pg-microsharding` is run (typically you want to have it in the root of your project, near the other configuration files).

You can export-default a regular function, an async function, or even a plain constant object.

## DSN and Addressing Databases

Option `--dsns`, if required, should be a comma separated list of DSNs.

Also, you may pass duplicated DSNs and even DSNs of replicas: the tool will filter them out and remain only master DSNs in the list.

DSN format examples (parts defaults are from environment variables):

* `postgresql://user:pass@hostname/db?options` (all parts are optional)
* `hostname:port/db` (all parts except the hostname are optional

## Command Line Tool

The `pg-microsharding` library consists of 2 parts:

1. A CLI tool allowing you to manipulate with microshards.
2. A set of PostgreSQL stored functions to call them from your app.

### Show Cluster Layout: pg-microsharding list

```bash
pg-microsharding list
```

This action prints the list of all PostgreSQL islands (pointed by DNSn), microshards and some statistics.

In `--verbose` mode, also prints detailed statistics anout insert/update/delete, index scans and seqscans.

### Allocate New Microshards: pg-microsharding allocate

```typescript
pg-microsharding allocate --shards=301-399 --activate=yes
```

This action allows you to create more microshard schemas in the cluster. The microshards are created on PostgreSQL the host pointed by the 1st DSN, so after it's done, run `pg-microsharding rebalance` to spread that new schemas across other nodes.

Each microshard can either be "active" or "inactive". When you create them, you tell the tool, should the microshards become active immediately (and thus, visible to `microsharding_list_active_shards()` API) or not. You can always activate the schemas later using the same exact command (it is idempotent).

### Move One Microshard: pg-microsharding move

```bash
pg-microsharding move \
  --shard=42 --from=host1 --to=host2 \
  --activate-on-destination=yes
```

Microshards can be moved from one PostgreSQL node to another. There is no need to stop writes while moving microshards: the tool uses PostgreSQL logical replication to stream each microshard table's data, and in the very end, acquires a quick write lock to finalize the move.

There are many aspects and corner cases addressed in the move action, here are some of them:

* The move is fast even for large microshards. The tool internally uses the same approach for data copying as `pg_dump`. First recreates the tables structure on the destination, except most of the indexes and foreign key constraints (only the primary key indexes or REPLICA IDENTITY indexes are created at this stage, since they are required for the logical replication to work). Then, it copies the data, utilizing the built-in PostgreSQL tablesync worker; this process is fast, since it inserts the data in bulk and doesn't update indexes. In the end, the tool creates the remaining indexes and foreign key constraints (this is where you may want to increase [maintenance\_work\_mem](https://www.postgresql.org/docs/current/runtime-config-resource.html) for the role you pass to pg-microsharding, since it directly affects the indexes creation time). Overall, this approach speeds up the copying by \~10x comparing to the naive way of using logical subscriptions.
* At each long running step, the tool shows a descriptive progress information: how many tuples are copied so far, what is the elapsed %, how much time is left, what are the SQL queries it executes (dynamically updatable block in console) etc.
* It also shows replication lag statistics for all physical replicas of the source and the destination, plus the logical replication lag of the temporary subscription.
* In the end, the tool activates the microshard on the destination and deactivates on the source, but it does it only when the replication lag in seconds dropped below some reasonable threshold (defaults to 20 seconds, but you can pass a lower value to be on a safe side). So the write lock is guaranteed to be acquired for only a brief moment.
* The tool runs it all in an automatically created tmux session. If you accidentally disconnect, then just connect back and rerun the same command line: instead of running another move action, if will jump you back in the existing session.

If you're unsure, you can practice with the move without activating the microshard on the destination (and without deactivating it on the source) by passing `--activate-on-destination=no` option. This is like a "dry-run" mode, where the tool does all the work, except the very last step. The moved schema on the destination won't be activated, and it will also be renamed using some long descriptive prefix (including the move date).

At any moment, you can abort the move with ^C. It is safe: half-moved data will remain on the destination, but the microshard schema will remaim invisible there for e.g. `microsharding_list_active_shards()` API (see below). If you then rerun the `move` action, it will start from scratch.

### Clean Old Moved Copies: pg-microsharding cleanup

```bash
pg-microsharding cleanup
```

When you move one or more microshards, pg-microsharding doesn't delete the old copy from the source host. Instead, it renames the schema (using some long descriptive prefix with date) and deactivates it.

Later, when you are sure that everything went well, you can remove such "backup" copies by running the cleanup action. It is interactive: it will tell you, what it wants to delete, and ask for an explicit confirmation.

### Rebalance All Islands: pg-microsharding rebalance

```bash
pg-microsharding rebalance --activate-on-destination=yes
```

This action runs multiple "move" sub-actions in parallel, utilizing [tmux](https://github.com/tmux/tmux/wiki) panes. Notice that tmux is required: it allows to resume the rebalancing if your SSH console on the server gets disconnected (in this case, just run the `rebalance` action again, and you'll "jump into" the existing session).

Before running the moves, the action calculates weights of each shard (by default, the weight is the microshard tables size in bytes, mutuplied by per-shard "weight factor"; see below). Then, it estimates, which microshards need to be moved to what islands, to achieve a more or less uniform distribution. The algorithm is complicated: among other heuristics, it tries to make sure that each island gets approximately the same number of microshards with comparable sizes (e.g. if you allocate 100 new empty microshards, then rebalancing will spread them across islands uniformly).

Once the rebalancing plan is ready, the tool will print it to you and ask for your confirmation. You can always run `pg-microsharding rebalance` and then press ^C to just see, what _would_ happen if you rebalance.

At any time, you can abort the rebalancing with ^C in any of the tmux panes. It is as safe as aborting the `move` action.

### Evacuate All Microshards from an Island

```bash
pg-microsharding rebalance \
  --decommission=host1 --activate-on-destination=yes
```

This mode of "rebalance" action allows you to remove a PostgreSQL host from the cluster, or even upgrade PostgreSQL to the next major version with no downtime. It moves all the microshards from the provided DSN, so the host becomes "empty". After the decommissioning is done, you can remove the host from the cluster or upgrade PostgreSQL, then rebalance the microshards back (rebalancing works fine across different major PostgreSQL versions).

### Tweak Island Weights: pg-microsharding factor

```bash
pg-microsharding factor --shards=host1 --factor="*1.2"
```

Imagine you have 10 PostgreSQL islands with rebalanced microshards, and you see on your monitoring charts that some island is loaded more than all other islands. E.g. it may experience higher CPU load, higher disk throughput etc.

Such situation typically happens, because one microshard became too large, or there is a customer data in some microshard that causes more load than the data of an average customer. In case you don't want to investigate this case too much, you can "duct tape" it by artificially "dissolving" a fraction of microshards from that overloaded island to other islands.

When you run `pg-microsharding factor --factor="*1.2"`, the tool artificially increases the "weight" of each microshard on the provided host (in this example, the increase is by 1.2, i.e. by 20%). This information is then remembered in the microshards themselves (and is displayed in `list` action), so you can run rebalancing and "dissolve" some of the microshards among other hosts. As a result, your target island will become less loaded (on average), and by repeating this step several times, you can achieve a more fair load distribution.

The "weight increase factor" is technically stored as a SQL comment on the microshard schema, and it travels along with the microshard when you move it.



## PostgreSQL Stored Functions API

This is the second part of pg-microsharding tool: a set of stored functions you add to your database.

### Installing into the Database

Run the following SQL files in your up- and down-migrations to install (or upgrade) and uninstall the tool:

* sql/pg-microsharding-up.sql: to install/upgrade the library
* sql/pg-microsharding-down.sql: to uninstall

E.g.:

```sql
-- mig/20250628100000.add-pg-microsharding.public.up.sql
CREATE SCHEMA microsharding;
SET search_path TO microsharding;
\ir ../pg-microsharding/sql/pg-microsharding-up.sql
```

```sql
-- mig/20250628100000.add-pg-microsharding.public.dn.sql
SET search_path TO microsharding;
\ir ../pg-microsharding/sql/pg-microsharding-down.sql
DROP SCHEMA microsharding;
```

In the above example, we create a separtate schema for the library, but it is not mandatory: you can also install it into schema `public` (all of the API functions have `microsharding_` prefix).

### List Active Shards: microsharding.list\_active\_shards()

This function returns the list of active microshard schemas in the current PostgreSQL database. When using the tool with [Ent Framework](https://ent-framework.org/), mention it in your `Cluster` object:

```typescript
export const cluster = new Cluster({
  shards: {
    nameFormat: "sh%04d",
    discoverQuery:
      "SELECT unnest FROM unnest(microsharding.microsharding_list_active_shards())",
  },
  ...
});
```

### Microsharding Debug Views

The `microsharding_migration_after()` function creates so-called "debug views" for each sharded table in your cluster. For instance, it you have `sh0001.users`, `sh0002.users` etc. tables. then it will create a debug view `public.users` with the definition like:

```sql
-- This is what pg-microsharding creates automatically.
CREATE VIEW public.users AS
  SELECT * FROM sh0001.users
  UNION ALL
  SELECT * FROM sh0002.users
  UNION ALL
  ...;
```

Even more, if you pass the list of all PostgreSQL hosts, and those hosts can access each other without a password (e.g. they have  `/var/lib/postgresql/N/.pgpass` files), then those debug views will work **across all shards on all nodes, including the remote ones** (using [foreign-data wrapper](https://www.postgresql.org/docs/current/postgres-fdw.html) functionality).

So **for debugging purposes**, you'll be able to run queries across all microshards in your `psql` sessions. This is typically very convenient.

Of course those **debug views are not suitable for production traffic**: cross-node communication in PostgreSQL, as well as query planning, work not enough inefficiently. Do not even try, use application-level microshards routing, like e.g. [Ent Framework](https://ent-framework.org/) provides.

```
$ psql
postgres=# SELECT shard, email FROM users
  WHERE created_at > now() - '1 hour'::interval;
-- Prints all recent users from all microshards, including
-- the microshards on other PosgreSQL nodes! Use for
-- debugging purposes only.
```

As of `microsharding_migration_before()`, you must call it before any changes are applied to your microsharded tables. The function drops all of the debug views mentioned above. E.g. if you remove a column from a table, PostgreSQL would not allow you to do it it this column is mentioned in any of the views, so it's important to drop the views and re-create them afterwards.

Typically, you just call `microsharding_migration_before()` in your pre-migration sequence and then call `microsharding_migration_after()` in your post-migration steps.
