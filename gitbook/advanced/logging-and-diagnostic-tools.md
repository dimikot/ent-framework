# Logging and Diagnostic Tools

Ent Framework includes reach instrumentation features that allows you to see, what exactly is happening in the cluster right now.

## Loggers

In [connect-to-a-database.md](../getting-started/connect-to-a-database.md "mention") article we defined our cluster the following way:

```typescript
export const cluster = new Cluster<PgClientPool, PgClientPoolOptions>({
  ...,
  loggers: {
    clientQueryLogger: (props) => console.debug(props.msg),
    swallowedErrorLogger: (props) => console.log(props),
  },
});
```

This is of course sub-optimal: e.g. Ent Framework will start printing all SQL queries it runs to the script console, which is not what you want.

So instead, plug in your own logging solution, like [Datadog](https://www.datadoghq.com), [Elasticsearch APM](https://www.elastic.co/observability/application-performance-monitoring) or any solution based on OpenTelemetry standard (like [Prometheus](https://prometheus.io)). Of course, you also don't have to log every single SQL query: you may just log errors, and even do it to a file or to the console.

Logger properties are defined in [Loggers.ts](https://github.com/clickup/ent-framework/blob/main/src/abstract/Loggers.ts) file.

### clientQueryLogger(props: ClientQueryLoggerProps)

This logger is called after each batched SQL query sent to the database. Here are the most important properties:

* `msg`: the query sent to the database.
* `error`: in case an error happened, its text representation (or `undefined` otherwise).
* `output`: raw results of the database driver library for the query. Don't log it entirely, since it may be too large.
* `elapsed`: an object with the number of milliseconds the query execution took, as 2 sub-properties: `total` (total time) and `acquire` (how much time the engine spent waiting for a connection becoming available in the pool).
* `annotations`: some information related to the [VC](../getting-started/vc-viewer-context-and-principal.md) that made the request. It's an array of objects, not noticeable sub-properties are: `vc` (text representation of VC principal and flavors) and `trace` (random-looking trace ID which is unique per each VC hierarchy).

See Loggers.ts for more properties.

