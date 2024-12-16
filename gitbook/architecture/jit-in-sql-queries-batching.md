# JIT in SQL Queries Batching

One of the core Ent Framework's features is that it batches multiple concurrently running calls into a single SQL query. It also doesn't use JOIN for good, to enable seamless microsharding support and allow you to write your application code as if there is no "N+1 Selects" problem existing at all. In a typical workload, there are **lots** of concurrent queries running even for a single web request, and the batching factor is high.

Batching greatly reduces the database connections utilization. Open connections are one of the most expensive resources in the cluster, even when some proxy service (like pgbouncer) sits between the backend and PostgreSQL.

In fact, even in a small backend cluster, you **must** use something like [pgbouncer](https://www.pgbouncer.org), [pgcat](https://github.com/postgresml/pgcat) or other alternative.

To do batching of multiple calls efficiently, we need to be able to build the resulting large SQL query as fast as possible, with the minimal Node CPU utilization.

Notice that PostgreSQL and other relational databases have the concept of "prepared statements": if you run multiple queries of the same shape (e.g. multiple INSERTs to the same table), you can create a "prepared statement" once with `PREPARE` (which will build and cache the execution plan), and then run it multiple times with `EXECUTE`, passing different values for different rows.

Ent Framework utilizes the same approach, but in Node.JS land. When receiving calls for batching, it recognizes their structure and dynamically builds ("compiles") a JS code for each unique input shape. This JS code is then materialized into a function (with `new Function(...)` which is essentially similar to JS `eval()` call under the hood), and that function is cached in memory. Notice that the function itself knows nothing about the actual data you're putting to the database: it is built based on the metadata only (like Ent field names and their types, DB table name etc.).

Then, instead of "glueing" the SQL query from pieces and lots of `if` statements on each input row, Ent Framework calls the cached function passing each data row there.

After several calls, the function becomes "hot", and Node.JS JITs (just-in-time compiles) it into machine code for the fastest execution possible.

Essentially, it's a "codegen without codegen", or "codegen at runtime with caching", or "JIT-compiling into JS".

Also, this approach lowers the risk of security vulnerabilities, since the SQL query "skeleton" is always built statically, and the actual values are injected there after the guaranteed escaping.

If you want to learn more, a good starting point is [PgRunner](https://github.com/clickup/ent-framework/blob/2665ffa319134f35df8e883d8923c4c554b20220/src/pg/PgRunner.ts) class and its:

* `createAnyBuilder()` method: builds long SQL expressions like `ANY('{aaa,bbb,ccc}')`
* `createInBuilder()` method: builds SQL expressions like `IN('aaa', 'bbb', 'ccc')`
* `createEscapeCode()` method: it knows the types and the explicit list of fields in advance, so it can avoid running multiple `if` statements at runtime and instead make decisions statically









