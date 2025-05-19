# Logging and Diagnostic Tools

Ent Framework includes reach instrumentation features that allows you to see, what exactly is happening in the cluster right now.

## Loggers

In [connect-to-a-database.md](../getting-started/connect-to-a-database.md "mention") article we defined our cluster the following way:

```typescript
export const cluster = new Cluster<PgClient, PgClientOptions>({
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

This logger is called after each batched SQL query sent to the database. Here are the most important properties of `ClientQueryLoggerProps`:

* `msg`: the query sent to the database.
* `error`: in case an error happened, its `string` representation (or `undefined` otherwise).
* `output`: raw results of the database driver library for the query. Don't log it entirely, since it may be too large.
* `elapsed`: an object with the number of milliseconds the query execution took, as 2 sub-properties: `total` (total time) and `acquire` (how much time the engine spent waiting for a connection becoming available in the pool).
* `annotations`: some information related to the [VC](../getting-started/vc-viewer-context-and-principal.md) that made the request. It's an array of objects, not noticeable sub-properties are: `vc` (text representation of VC principal and flavors) and `trace` (random-looking trace ID which is unique per each VC hierarchy).

See Loggers.ts for more properties.

In case an error is delivered to this logger, it means that the error was severe: it caused the Ent Framework to throw an exception to the client code.

## swallowedErrorLogger(props: SwallowedErrorLoggerProps)

As opposed to `clientQueryLogger`, this logger is called on non-critical (recoverable) errors, which likely did not cause the engine to throw an exception back to the client code. Such errors include: shard discovery retries, master-replica discovery failed attempts, connection failures, various recoverable timeouts and slowdowns etc.

Treat such events as "warnings": better log them and monitor them, but to not trigger a panic in case they appear.

Here are the most important properties of `SwallowedErrorLoggerProps`:

* `error`: the original error (of type `unknown`) caused this logger to trigger.
* `where`: a `string` hint on where the error happened.
* `elapsed`: the time of the subject operation; if the error is related to some condition and not to action lasting over time, you'll get a null here.
* `importance`: either "low" or "high" strings.

## Scoreboard Tool

In [cluster-maintenance-queries.md](cluster-maintenance-queries.md "mention") article we mentioned that Ent Framework runs a number of periodic internal queries across the cluster that are invisible to the user. Also, in case one node goes down or times out, the engine runs a series of retries, and it also tries to run cluster rediscovery to find a good replacement node.

Doesn't it all look too opaque for you?

The Scoreboard tool is to remove this opacity and expose, what exactly happens under the hood when there is a stream of queries coming to all nodes of the cluster.

Scoreboard prints all nodes in the cluster (masters and replicas) as lines on the screen. It sends test "ping" queries to every node and displays, what happens. Also, if you shut down a node, it will start showing its state on the same timeline (and what rediscovery operations does it run), plus what errors does it observe.

To run the tool (depending on your package manager):

```
pnpm exec ent-scoreboard
```

Parameters:

* `--pingExecTimeMs`: when it sends a ping query (which is `pg_sleep()`), how long do you want this test query to run (by default, 0 ms, which is "as fast as possible").
* `--pingParallelism`: how many pings to send in parallel (by default, it is 1).
* `--pingPollMs`: how often to send the ping messages (200 ms).
* `--maxQueries`: how many last pings to show on each line
* `--refreshMs`: how often to repaint the screen

## Ping Tool

As opposed to Scoreboard tool that sends test queries to all nodes of the cluster in parallel, the Ping tool only does it to one chosen shard client (master or replica), but it prints more detailed messages about what's happening.

To run the tool (depending on your package manager):

```
pnpm exec ent-ping
```

Parameters:

* `--shard`: the shard number to ping.
* `--pingExecTimeMs`: how long you want each ping query to take (each ping is a call to `pg_sleep()`).
* `--pingPollMs`: delay between pings (default: 500 ms).
* `--pingIsWrite` : if true, the pings will be sent to the master node, not to a random shard replica.

