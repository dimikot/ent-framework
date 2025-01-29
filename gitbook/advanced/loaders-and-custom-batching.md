# Loaders and Custom Batching

One of the key features of Ent Framework is a holistic [n+1-selects-solution.md](../getting-started/n+1-selects-solution.md "mention"). When you run the calls addressing a single row in the database (read or write), the engine batches that calls into compound SQL queries, which allows to save a lot on round trip time.

The core of that idea lies in Meta's [DataLoader](https://github.com/graphql/dataloader) pattern, which initially was invented for just one case, loading an object by its ID. Ent Framework generalizes DataLoader to _all_ read and write operations.

## Loader and Node Event Loop

How event loop, Promises and I/O work in Node is a complicated topic with many nuances, best described in the [official documentation](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick).

Here, we'll only give a rough and inprecise overview, enough to understand the Loader abstraction better.

Event loop consists of multiple "phases", each phase is a sequence of Macrotasks, and after each macrotask, all pending Microtasks are executed.&#x20;

1. In every phase, Node first picks the oldest pending macrotask (like callbacks waiting for I/O results, timers etc.).&#x20;
2. Then, once the macrotask finishes, it run the pending microtasks (like `Promise#then()` invocations or callbacks scheduled with `process.nextTick()`), until there are no more microtasks pending.
3. Microtasks may schedule new macrotasks (for the next phase or the next spin) of new microtasks (for the same phase), and then eventually it all starts from the beginning.

The main idea behind Loader is to accumulate all Ent Framework calls (like `loadX()`, `insert()` etc.) within one microtasks block, group them together and then flush as one giant SQL query towards the resolution in the next macrotask I/O processing. Only the calls of the same type are batched together (e.g. load with load, insert with insert); the calls of different types run in independent I/O operations, and thus, almost always resolve in different microtask blocks.

<figure><img src="../.gitbook/assets/loader-event-loop.svg" alt="" width="417"><figcaption></figcaption></figure>

