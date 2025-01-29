# Loaders and Custom Batching

One of the key features of Ent Framework is a holistic [n+1-selects-solution.md](../getting-started/n+1-selects-solution.md "mention"). When you run the calls addressing a single row in the database (read or write), the engine batches that calls into compound SQL queries, which allows to save a lot on round trip time.

The core of that idea lies in Meta's [DataLoader](https://github.com/graphql/dataloader) pattern, which initially was invented for just one case, loading an object by its ID. Ent Framework generalizes DataLoader to _all_ read and write operations.

## Node Event Loop

Event loop, Promises and I/O in Node are complicated topics with many nuances, best described in the [official documentation](https://nodejs.org/en/learn/asynchronous-work/event-loop-timers-and-nexttick).

Here, we'll only give a rough and inprecise overview, enough to understand the Loader abstraction better.

Event loop consists of multiple "phases", each phase is a sequence of Macrotasks, and after each macrotask, all pending Microtasks are executed.&#x20;

1. In every phase, Node first picks the oldest pending macrotask (like callbacks waiting for I/O results, timers etc.).&#x20;
2. Then, once the macrotask finishes, it run the pending microtasks (like `Promise#then()` invocations or callbacks scheduled with `process.nextTick()`), until there are no more microtasks pending.
3. Microtasks may schedule new macrotasks (for the next phase or the next spin) of new microtasks (for the same phase), and then eventually it all starts from the beginning.

The main idea behind Loader is to accumulate all Ent Framework calls (like `loadX()`, `insert()` etc.) within one microtasks block, group them together and then flush as one large SQL query towards the resolution in the next macrotask I/O processing. Only the calls of the same type are batched together (e.g. load with load, insert with insert); the calls of different types relate to independent I/O macrotasks, and thus, almost always resolve in different microtask blocks.

<figure><img src="../.gitbook/assets/loader-event-loop.svg" alt="" width="417"><figcaption></figcaption></figure>

## Simple Loader Example

Loader class allows you to build your own batching logic, for the cases when Ent Framework internal batching is not enough.

Let's first build a very simple Loader, similar to what the built-in `loadNullable()` uses internally.

```typescript
class SimpleTopicLoader {
  private ids = new Set<string>();
  private results = new Map<string, EntTopic>();

  constructor(private vc: VC) {}

  onCollect(id: string): void {
    this.ids.add(id);
  }

  async onFlush(): Promise<void> {
    const ids = [...this.ids];
    const topics = await EntTopic.select(
      this.vc,
      { id: ids },
      Number.MAX_SAFE_INTEGER, // limit
    );
    for (const topics of topic) {
      this.results.set(topic.id, topic);
    }
  }
  
  onReturn(id: string): EntTopic | null {
    return this.results.get(id) ?? null;
  }
}
```

The main beauty of Loaders is that your code still looks like you're working with single objects (or sincle IDs), not with lists:

```typescript
async function getTopic(vc: VC, id: string) {
  const topic = await vc.loader(SimpleTopicLoader).load(id);
  return topic;
}
...
// The following calls will be batched into 1 SELECT query.
await mapJoin([id1, id2, ...], async (id) => getTopic(vc, id));
```

I.e. Loader is that exact abstraction that allows you to write a "single-object" code and have free I/O batching under the hood.

Each Loader is a class with at least the following methods:

* `onCollect(arg1, arg2, ...)`: it's simply called when you run `vc.loader(MyLoader).load(arg1, arg2, ...)`. Your goal here is to accumulate all of the incoming requests in some private property (typically, in a Set or in a Map).
* `onFlush()`:  this method is called in the end of microtasks block on the diagram above. By that time, you can assume that all of the incoming requests are accumulated already. So you build a final batched query, read its response and save it to another private property (typically, a Map, where keys are those `arg1`, `arg2` etc. that we used above.
* `onReturn(arg1, arg2, ...)`: it's called right before `vc.loader(MyLoader).load(arg1, arg2, ...)` returns in the caller's code. Here, you just read from your accumulated results and return the value to the client.
* Also, you may defined a constructor, to receive and store a VC. VC is passed to each Loader, for the cases when your `onFlush()` logic requires it. (Your Loader may work with any other I/O service, not necessarily with Ent Framework. E.g. you may read from Redis or DynamoDB directly.)

So, you can see that the arguments type of `onCollect()` and `onReturn()` methods become the argument types of \``` .load(..)` `` exactly, and the return type of `onReturn()` becomes the return type of `.load()`. The engine uses TypeScript inference, and it will warn you in case some types mismatch somewhere.
