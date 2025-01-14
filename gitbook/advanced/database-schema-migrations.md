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

* `PGHOST`: database server hostname; when the cluster has multiple nodes in it, separate them here with commas.
* `PGPORT`: database servers port.
* `PGUSER`: database user.
* `PGPASSWORD`: database password.
* `PGDATABASE`: database name.

Other variables:

* `PGMIGDIR`: the default value for `--migdir` option.

## Configuration File

