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

In case your project doesn't have microsharding and uses just 1 database, you can use pg-mig too: just tell it to target only 1 schema (e.g. `public`).

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

The file `pg-mig.config.js` is searched in all parent folders starting from the current working directory when `pg-mig` is run (typically you want to have it in the root of your project, near the other configuration files).

## Migration Version Files

When running in default mode, `pg-mig` tool reads (in order) the migration versions `*.up.sql` files from the migration directory and applies them all on the hosts passed (of course, checking whether the version file has already been applied before or not).

The migration version file name has the following format (examples):

```
mig/
  before.sql
  20231017204837.do-something.sh.up.sql
  20231017204837.do-something.sh.dn.sql
  20241107201239.add-table-abc.sh0000.up.sql
  20241107201239.add-table-abc.sh0000.dn.sql
  20241201204837.change-other-thing.sh.up.sql
  20241201204837.change-other-thing.sh.dn.sql
  20251203493744.install-pg-extension.public.up.sql
  20251203493744.install-pg-extension.public.dn.sql
  after.sql
```

Here,

* The 1st part is a UTC timestamp when the migration version file was created.
* The 2nd part is a descriptive name of the migration (can be arbitrary). Think of it as of the commit title.
* The 3rd part is the "schema name prefix" (microshard name prefix). The SQL operations in the file will be applied only to the schemas whose names start with that prefix.
* The 4th part is either "up" ("up" migration) or "dn" ("down" migration). Up-migrations roll the database schema version forward, and down-migrations allow to undo the changes.
* There are 2 optional special files: `before.sql` and `after.sql`. They are executed on every PostgreSQL hosts once per each pg-mig run, in independent transactions. It is convent to run some common initialization or maintenance there, especially when working with microsharding (there will be an example provided later in Advanced section).

It is your responsibility to create up- and down-migration SQL files. Basically, you provide the DDL SQL queries on how to roll the database schema forward and how to roll it backward.

You can use any `psql`-specific instructions in `*.sql` files: they are fed to `psql` tool directly. E.g. you can use environment variables, `\echo`, `\ir` for inclusion etc. See [psql documentation](https://www.postgresql.org/docs/current/app-psql.html) for details.

## Apply the Migrations

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
before.sql
20231017204837.do-something.sh.up.sql              # .sh.
20241107201239.add-table-abc.sh0000.up.sql         # .sh0000.
20241201204837.change-other-thing.sh.up.sql        # .sh.
20251203493744.install-pg-extension.public.up.sql  # .public.
after.sql
```

Then, the following will happen in parallel on all hosts and for all microshards:

* On every PostgreSQL host, `before.sql` will run. Until it succeeds, no other migration versions will even start running.
* For every `shNNNN` schema (basically, all schemas starting with "sh" prefix) except `sh0000`, the version `do-something.sh` will be applied first, and then, if it succeeds, the `change-other-thing.sh` will be run. Notice that `sh0000` is excluded, because there exist other migration file versions targeting `sh0000` precisely (and "sh0000" prefix is longer than "sh").
* For `sh0000` schema, `add-table-abc.sh0000` will be run.
* For `pubic` schema, `install-pg-extension.public` will be run.
* In the end, on each host, `after.sql` will run (in case the migration succeeds).

All in all, the behavior here is pretty intuitive: if you want to target a concrete schema, just use its full name; if you want multiple schemas to be considered, then use their common prefix.

If the migration file application succeeds, it will be remembered on the corresponding PostgreSQL host, in the corresponding schema (microshard) itself. So next time when you run the tool, it will understand that the migration version has already been applied, and won't try to apply it again.

Each migration version file is applied atomically, in a single transaction. Also, it't the same exact transaction where pg-mig remembers that the version has been applied, so there is no chance that your version will run out of sync with the database.

When the tool runs, it prints a live-updating information about what migration version file is in progress on which host in which schema (microshard). In the end, it prints the final versions map across all of the hosts and schemas.

If you have multiple PostgreSQL hosts and/or multiple target schemas, you can control the level of parallelism with `--parallelism=N` command line option (defaults to 10).

## Undo the Migrations

With e.g. `--undo=20231017204837.do-something.sh` argument, the tool will run the down-migration for the corresponding version on all nodes. If it succeeds, it will remember that fact on the corresponding node in the corresponding schema. Only the very latest migration version applied can be undone, and you can undo multiple versions one after another of course.

Undoing migrations in production is not recommended (since the application code may rely on its new structure), although you can do it of course. The main use case for undoing the migrations is **during development**: you may want to test your DDL statements multiple times, or you may pull from Git and get someone else's migration before yours, so you'll need to undo your migration and then reapply it.

## Create a New Migration Version File

With `--make=my-migration-name@sh` argument, pg-mig creates a new pair of empty files in the migration directory. E.g. if you run:

```
pg-mig --make=my-migration-name@sh
```

then it will create a pair of empty files which looks like `my-dir/20251203493744.my-migration-name.sh.up.sql` and `my-dir/20251203493744.my-migration-name.sh.dn.sql` which you can edit further.

Of course, you can also create such a pair of files manually.

New migration version files can only be appended in the end of the list (lexicographically, or by timestamp, which is the same). If pg-mig detects that you try to apply some migrations conflicting with what's remembered in the database, it will print the error and refuse to continue. This is similar to "fast-forward" mode in Git, and we'll talk about it in details later in the article.

## The Initial Migration

When you start using pg-mig tool, run it with `--make` to create your initial migration:

```
pg-mig --make=initial@public
```

Since almose every PostgreSQL database has schema `public` pre-created, it's convenient to target this schema in your initial migration version. If you need microsharding support, then that initial (or the following) migration version may create the desired number of microshard schemas.

### In a New Project

If you use pg-mig in a brand new project, then just edit the created `*.initial.public.up.sql` and \``*.initial.public.dn.sql` files in your text editor and run `pg-mig` to apply the versions.

```sql
-- 20251203493744.initial.public.up.sql
CREATE TABLE users(
  id bigserial PRIMARY KEY,
  email varchar(256) NOT NULL
);
```

And the corresponding down-file:

```sql
-- 20251203493744.initial.public.dn.sql
DROP TABLE users;
```

During the execution of the above files, pg-mig will set the corresponding shema as current; in the above example, with the implicit `SET search_path=public` query.

For debugging purposes, while building the SQL DDL statements, it's convenient to undo and apply the version in one command line:

```bash
pg-mig --undo=20251203493744.initial.public; pg-mig
```

### In an Existing Project

If you plug in pg-mig to an existing project, to start using the tool for all further database migrations, just use `pg_dump` and put its output to the initial version file:

```bash
pg_dump --schema-only --schema=public your-db-name \
  > mig/20251203493744.initial.public.up.sql  
```

If your database has multiple schemas, but no microsharding, you have 2 options:

1. If the schemas are completely independent on each other, so the changes may apply in parallel, use `*.schema1.{up,down}.sql` and `*.schema2.{up,down}.sql` files.
2. Otherwise (and it would be the most frequent case), just use `*.public.{up,down}.sql` version files targeting schema `public` . In most of PostgreSQL databases, schema `public` pre-exists and is mentioned in the default `search_path`, so targeting this schema in your migration version files will guarantee that the versions will be applied strictly sequentially, with no parallelism.

## Use Standard psql Meta-Commands

The real power of pg-mig that many other migration tools don't have is that the migration version files are processed through the [standard `psql` tool](https://www.postgresql.org/docs/current/app-psql.html), so you can use its [meta-commands](https://www.postgresql.org/docs/current/app-psql.html) there. Each file is also applied atomically: "all or nothing", in a single transaction.

Below are several examples (see `psql` documentation for more).

### Include Other \*.sql Files

You can include other `*.sql` files (even using relative paths):

```sql
-- mig/20231017204837.do-something.sh.up.sql
\ir ../vendor/path/to/another/file.sql
ALTER TABLE ...
```

### Echo Diagnostics

Use `\echo` for debugging

```sql
-- mig/20231017204837.do-something.sh.up.sql
\echo Running a dangerous query...
ALTER TABLE ...
```

### Assign and Use Variables

The `psql` tool allows to define macros and use them as variables:

```sql
-- mig/20231017204837.do-something.sh.up.sql
SELECT 'hello' AS var1 \gset
\echo :var1
UPDATE my_table SET some=:'var1';
```

### Use Environment Variables

If you assign e.g. `process.env.HOSTS = "{a,b,c}"` in your `pg-mig.config.js` file, you can use that value in all of the version files using the standard `psql` feature:

```sql
-- mig/20231017204837.initial.public.up.sql
\set HOSTS `echo "$HOSTS"`
SELECT my_function(:'HOSTS');
```

### More Meta-Commands

See the [official psql documentation](https://www.postgresql.org/docs/current/app-psql.html) for more meta-commands.

## Transactions, CREATE INDEX CONCURRENTLY

Every migration version file is executed in a separate transactions, but sometimes you'll want to make an exception.

E.g. it is highly discouraged to create indexes in transactions using the plain `CREATE INDEX` query, especially when the table is large. The query acquires a write lock on the table, so no data can be written to it until the index creation finishes, which may take many minutes.

Luckily, PostgreSQL supports a non-blocking version of this query, `CREATE INDEX CONCURRENTLY`. It allows write when the index is creating. The query has its downsides though:

1. It may be 2 times slower than the regular `CREATE INDEX`.
2. In rare cases, it may fail and leave the index in a "broken" state. Nothing too bad will happen in terms of the database health though: you'll just need to drop that broken index and retry.
3. It must run outside of `BEGIN...COMMIT` transaction block.

Use the following up-migration file to deal with the downsides above:

```sql
-- $parallelism_per_host = 2
COMMIT;
DROP INDEX IF EXISTS users_email;
CREATE UNIQUE INDEX CONCURRENTLY users_email ON users(email);
BEGIN;
```

And the down-migration file:

```sql
COMMIT;
DROP INDEX CONCURRENTLY IF EXISTS users_email;
BEGIN;
```

Here, we first tell pg-mig that it should not run this script with concurrency higher than `$parallelism_per_host=2` (for instance, if you have multiple microshard schemas `shNNNN` on that host, then it will apply the query not to all of them simultaneously, but slower). This is a good practice to not max out the database server CPU (PostgreSQL also has a built-in protection against running too many maintenance queries in parallel, but often times it's better to be explicit).

Then, we close the transaction that pg-mig automatically opens for each migration version file, run `CREATE INDEX CONCURRENTLY` and, in the end, open a new transaction to let pg-mig commit the new version update fact to the database. It makes this migration version non-transactional, so there is a nonzero chance that it may fail. Also, as `CREATE INDEX CONCURRENTLY`  may legally fail as well and produce a "broken index", we use `DROP INDEX IF EXISTS` query before creating the index, to remove any leftovers.

In a rare case when the migration fails, you'll be able to just rerun pg-mig: it will just continue from the place where it failed. (In fact, when using microsharding, it will only continue with the schemas that failed, so the rerun will be way quicker than the initial run).

## Parallelism Limiting Options

Here is the complete list of `-- $` pseudo comments that pg-mig supports in the migration version files:

* `$parallelism_per_host=N`: as mentioned above, this option forces the parallel migrations for schemas on the same host to wait for each other, not allowing to run more than N of then at the same time.
* `$parallelism_global=N`: limits parallelism of this particular version _within the same schema prefix_ across all hosts.
* `$delay=M`: introduces a delay (in ms) between each migration. You can use it with `$parallelism_global` to reduce load on the database even further.
* `$run_alone=1`: if set to 1, no other migrations, _including other schema prefixes_, will run on any other host while this one is running. I.e. it introduces global ordering of the migration files application across schemas. This option is useful when you want to e.g. install a PostgreSQL extension used in other schemas, so you want all other schemas to wait until the installation finishes.

## Advanced: Merge Conflicts

Migration version files are applied in strict order per each schema, and the same way as Git commits, they form a dependency **append-only** chain.

### Happy Path: Version is Appended

The scenario below will happen most of the times.

Imagine that on your local dev environmant (e.g. on your laptop) you have already applied the following migration versions to particular schemas in your local database:

```
20231017204837.do-something.sh
20241201204837.change-other-thing.sh
20241202001000.and-one-more-thing.sh
```

Then, another developer pushes the code with a new version file:

```
20241202002000.their-thing.sh.up.sql
```

And you pull it to your local working copy:

```
20231017204837.do-something.sh.up.sql
20241201204837.change-other-thing.sh.up.sql
20241202001000.and-one-more-thing.sh.up.sql
20241202002000.their-thing.sh.up.sql    <-- new version pulled
```

Here, if you run pg-mig tool, it will happily apply that new version, since its timestamp comes after all of the versions you already have in your database.

Since the changes in the database are relatively rare, in most of the cases, you'll experience this "happy" behavior.

### Unhappy Path: Explicit Merge Conflict

Now imagine you still had the same versions in your local database:

```
20231017204837.do-something.sh
20241201204837.change-other-thing.sh
20241202001000.and-one-more-thing.sh  <-- you work on this
```

But when you pulled, you got the new version file sitting in the middle:

```
20231017204837.do-something.sh.up.sql
20241201204837.change-other-thing.sh.up.sql
20241202000000.middle-thing.sh.up.sql  <-- new version pulled
20241202001000.and-one-more-thing.sh.up.sql
```

If you then run pg-mig tool locally, it will refuse to work:

```
Migration timeline violation: you're asking to apply
version 20241202000000.middle-thing.sh, although
version 20241202001000.and-one-more-thing.sh has already
been applied. Hint: make sure that you've rebased on
top of the main branch, and new migration versions are
still the most recent.
```

So what you'll need to do is to undo your latest migration version and then rerun pg-mig:

```
pg-mig --undo=20241202001000.and-one-more.sh
pg-mig
```

### Unhappy Path: Implicit Conflict

Imagine you added a new version file:

```
20231017204837.do-something.sh.up.sql
20241202001000.your-new-thing.sh.up.sql  <-- not yet pushed
```

You tested everything locally and are now ready to push to Git. But right before, you must pull from Git and ensure that your new verson file is still in the very end of the list of migration version files. Because if you don't do it, and some other developer appended another version file, the following trouble will appear:

```
20231017204837.do-something.sh.up.sql
20241202001000.your-new-thing.sh.up.sql     <-- not yet pushed
20241202002000.other-dev-thing.sh.up.sql    <-- just pulled
```

If you blindly push this, then there is a risk that anyone (or any environment) where `20231017204837.do-something.sh` and `20241202002000.other-dev-thing.sh` are already applied, will not be able to migrate anymore: they will get the error mentioned above.

I.e. right before pushing, you must ensure that all migration version files you add within the new commits really appear in the end of the versions in Git. If not, then you'll need to rename your files using the latest timestamp:

```
mv 20241202001000.your-new-thing.sh.up.sql \
  20241202002200.your-new-thing.sh.up.sql
```

In practice, the situation is not as bad as it sounds:

1. If it breaks, it's easy to fix: just rename one file and push a new commit.
2. Database changes are relatively rare, and deployments also don't typically happen immediately after each pushed commit (unless you are very lucky), so the chance of catching such an ordering conflict are low.
