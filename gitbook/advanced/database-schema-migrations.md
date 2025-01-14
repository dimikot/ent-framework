# Database Schema Migrations

As opposed to classical ORMs (like [Prisma](https://www.prisma.io) or [Drizzle](https://orm.drizzle.team)), Ent Framework does not have any built-in database migration tool, and it doesn't infer SQL tables schema for you from the TypeScript schema definition.

In terms of the storage layer, Ent Framework operates at the lower level than the ORMs mentioned above. Ent abstraction is in fact very close to PostgreSQL layer. Such approach is the exact sweet spot and the exact trade-off between being flexible (e.g. to expose all bleeding edge PostgreSQL features without hiding them) and being useful in practice.

Database migration is a complicated process with many details. You can use any existing tools (like Liquibase) to organize it, or you can plug in Ent Framework to your existing database (considering you are already doing migrations for that database somehow).

There is one important aspect though: no mainstream solutions support microsharding out of the box.

## Migrations in Microsharding Environment

When working with [microsharding](../scalability/sharding-microsharding.md), you'll have hundreds of PostgreSQL schemas (with names like `sh01234`) living on multiple islands and PostgreSQL nodes. All those schemas (microshards) have exactly the same set of tables, indexes, stored functions etc. At the same time, you don't want to sacrifice any of the PosrgreSQL built-in features when adding microsharding to your project.

So, database migration gets several imporant aspects, that no mainstream tools support well enough at the moment:

1. Track database schema version per each microshard individually. I.e. if you add a column to some table, run the migration to apply it to all physical tables in microshards, and it fails in the middle, next time you run the migration process, it has to continue from the microshard where it left off.
2. Apply the changes to multiple PostgreSQL nodes and microshards in a controlled-parallel way, otherwise they will take forever to finish. I.e. the migration tool must know the entire cluster configuration, not only one PostgreSQL node.

To support the above in microsharded environment, it is recommended to use [pg-mig](https://www.npmjs.com/package/@clickup/pg-mig) tool to organize the migration for databases backed by Ent Framework.

## The pg-mig Tool

The **pg-mig** tool allows to create a PostgreSQL database schema (with tables, indexes, sequences, functions etc.) and apply it consistently across multiple PostgreSQL nodes (across multiple microshard schemas on multiple hosts). The behavior is transactional per each microshard per migration version ("all or nothing").

In other words, pg-mig helps to keep your database clusters' schemas identical (each microshard schema will have exactly the same DDL structure as any other schema on all other hosts).

## Usage

```
pg-mig
  [--migdir=path/to/my-migrations/directory]
  [--hosts=host1,host2,...]
  [--port=5432]
  [--user=user-which-can-apply-ddl]
  [--pass=password]
  [--db=my-database-name]
  [--undo=20191107201239.my-migration-name.sh]
  [--make=my-migration-name@sh]
  [--list | --list=digest]
  [--parallelism=8]
  [--dry]
```

All of the command line arguments are optional, the tool uses defaults from environment variables or `pg-mig.config.js` file.

## Environment Variables

There are variables standard for `psql` tool:

* `PGHOST`: database server hostname. When the cluster has multiple nodes in it, separate them here with commas. You may also include both master and replica hosts in the list: the tool is smart enough to only use the master nodes and ignore everything else.
* `PGPORT`: database servers port.
* `PGUSER`: database user.
* `PGPASSWORD`: database password.
* `PGDATABASE`: database name.

Other variables:

* `PGMIGDIR`: the default value for `--migdir` option.

## Configuration File

Instead of setting the environment variables, you can export the same exact values in `pg-mig.config.js` file by e.g. deriving them directly from the Ent Framework cluster configuration:

```javascript
"use strict";
const cluster = require("ents/cluster").cluster;
const islands = cluster.options.islands();
const firstNode = islands[0].node[0];
module.exports = {
  PGHOST: islands
    .map((island) => island.nodes.map(({ host }) => host)
    .flat()
    .join(","),
  PGPORT: 5432, // we don't want to use pgbouncer port here
  PGUSER: firstNode.user,
  PGPASSWORD: firstNode.password,
  PGDATABASE: firstNode.database,
  PGSSLMODE: firstNode.ssl ? "prefer" : undefined,
  PGMIGDIR: `${__dirname}/mig`,
};
```

The file `pg-mig.config.js` is searched in all parent directories starting from the current working directory when `pg-mig` is run (typically you want to have it in the root of your project, near the other configuration files).

## Migration Version Files

When running in default mode, `pg-mig` tool reads (in order) the migration versions `*.up.sql` files from the migration directory and applies them all on the hosts passed (of course, checking whether the version file has already been applied before or not).

The migration version file name has the following format (examples):

```
mig/
  20231017204837.do-something.sh.up.sql
  20231017204837.do-something.sh.dn.sql
  20241107201239.add-table-abc.sh0000.up.sql
  20241107201239.add-table-abc.sh0000.dn.sql
  20241201204837.change-other-thing.sh.up.sql
  20241201204837.change-other-thing.sh.dn.sql
  20251203493744.install-pg-extension.public.up.sql
  20251203493744.install-pg-extension.public.dn.sql
```

Here,

* The 1st part is a UTC timestamp when the migration version file was created.
* The 2nd part is a descriptive name of the migration (can be arbitrary). Think of it as of the commit title.
* The 3rd part is the "schema name prefix" (microshard name prefix). The SQL operations in the file will be applied only to the schemas whose names start with that prefix.
* The 4th part is either "up" ("up" migration) or "dn" ("down" migration). Up-migrations roll the database schema version forward, and down-migrations allow to undo the changes.

It is your responsibility to create up- and down-migration SQL files. Basically, you provide the DDL SQL queries on how to roll the database schema forward and how to roll it backward.

You can use any `psql`-specific instructions in `*.sql` files: they are fed to `psql` tool directly. E.g. you can use environment variables, `\echo`, `\ir` for inclusion etc. See [psql documentation](https://www.postgresql.org/docs/current/app-psql.html) for details.

## Applying the Migrations

To run the up migration, simply execute one of:

```
pnpm pg-mig
npm run pg-mig
yarn pg-mig
```

Technically, pg-mig doesn't know anything about microsharding; instead, it recognizes the databasde schemas. Each migration version will be applied (in order) to all PostgreSQL schemas (aka microshards) on all hosts. The schema names should start from the prefix provided in the migration version file name.&#x20;

If multiple migration files match some schema, then only the file with the **longest prefix** will be used; in the above example, prefix "sh" effectively works as "sh\* except sh0000", because there are other migration version files with "sh0000" prefix.

E.g. imagine you have the following migration version files:

```
20231017204837.do-something.sh.up.sql             # .sh.
20241107201239.add-table-abc.sh0000.up.sql        # .sh0000.
20241201204837.change-other-thing.sh.up.sql       # .sh.
20251203493744.install-pg-extension.public.up.sql # .public.
```

Then, the following will happen in parallel:

* For every `shNNNN` schema except `sh0000`, the version `do-something.sh` will be applied first, and then, if it succeeds, the `change-other-thing.sh` will be run. Notice that `sh0000` is excluded, because there exist other migration file versions targeting `sh0000` precisely (and "sh0000" prefix is longer than "sh").
* For `sh0000` schema, `add-table-abc.sh0000` will be run.
* For `pubic` schema, `install-pg-extension.public` will be run.

All in all, the behavior here is pretty intuitive: if you want to target a concrete schema, just use its full name; if you want multiple schemas to be considered, then use their common prefix.

If the migration file application succeeds, it will be remembered on the corresponding PostgreSQL host, in the corresponding schema (microshard) itself. So next time when you run the tool, it will understand that the migration version has already been applied, and won't try to apply it again.

When the tool runs, it prints a live-updating progress about what migration version file is in progress on which host in which schema (microshard). In the end, it prints the final versions map across all of the hosts and schemas.

\
\
