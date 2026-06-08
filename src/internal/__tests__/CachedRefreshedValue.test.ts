import { AsyncLocalStorage } from "async_hooks";
import delay from "delay";
import pDefer from "p-defer";
import waitForExpect from "wait-for-expect";
import { CachedRefreshedValue } from "../CachedRefreshedValue";

jest.useFakeTimers({ advanceTimers: true });

const OPTIONS = {
  delayMs: 10,
  deps: {
    delayMs: 100,
    handler: () => "",
  },
  warningTimeoutMs: 1000,
  onError: () => {},
  delay: async (ms: number) => delay(ms),
};

// Ensures that the instance is destroyed after each test.
let cache: CachedRefreshedValue<unknown>;
afterEach(() => {
  cache?.destroy();
});

test("first value", async () => {
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    resolverFn: jest
      .fn()
      .mockReturnValueOnce("first")
      .mockReturnValueOnce("second")
      .mockReturnValueOnce("third"),
  });
  expect(await cache.cached()).toBe("first");
});

test("latest value", async () => {
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    resolverFn: jest
      .fn()
      .mockReturnValueOnce("first")
      .mockReturnValueOnce("second")
      .mockReturnValueOnce("third")
      .mockReturnValue("latest value"),
  });
  for (let i = 0; i < 3; i++) {
    await cache.cached();
    await delay(30);
  }

  expect(await cache.cached()).toBe("latest value");
});

test("error swallowing", async () => {
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    resolverFn: jest
      .fn()
      .mockRejectedValueOnce(Error("Error"))
      .mockReturnValue("after error"),
  });
  expect(await cache.cached()).toBe("after error");
});

test("error handler", async () => {
  const err = Error("Error");
  const onError = jest.fn();
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    onError,
    resolverFn: jest.fn().mockRejectedValueOnce(err).mockReturnValue("first"),
  });
  await cache.cached();
  expect(onError).toBeCalledWith(err, expect.any(Number));
});

test("eventual consistency", async () => {
  const slowFn = jest.fn();
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    resolverFn: jest
      .fn()
      .mockImplementationOnce(async () => {
        await delay(2000); // longer than delayMs
        slowFn();
        return "timed out value";
      })
      .mockReturnValue("first"),
  });
  await cache.cached();
  await delay(1000);
  expect(await cache.cached()).toBe("first");
  expect(slowFn).toBeCalled();
});

test("timeout warning", async () => {
  const deferred = pDefer();
  const onError = jest.fn();
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    onError,
    warningTimeoutMs: 100,
    resolverFn: async () => deferred.promise,
  });
  const promise = cache.cached();
  await delay(200);
  deferred.resolve("first");
  await promise;
  expect(onError.mock.lastCall[0]).toMatchInlineSnapshot(
    "[Error: CachedRefreshedValue.refreshLoop: Warning: resolverFn() did not complete in 100 ms!]",
  );
});

test("custom delay handler", async () => {
  const delayFn = jest.fn().mockImplementation(async (ms: number) => delay(ms));
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    resolverFn: jest.fn().mockReturnValue("foo"),
    delay: delayFn,
    delayMs: 10,
  });
  await cache.cached();
  expect(delayFn).toBeCalledWith(10);
});

test("throwing in onError during timeout", async () => {
  const deferred = pDefer();
  const onError = jest.fn().mockImplementation(() => {
    throw Error("Error in onError");
  });
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    onError,
    warningTimeoutMs: 100,
    resolverFn: async () => deferred.promise,
  });
  const promise = cache.cached();
  await delay(200);
  deferred.resolve("first");
  await promise;
  expect(onError.mock.lastCall[0]).toMatchInlineSnapshot(
    "[Error: CachedRefreshedValue.refreshLoop: Warning: resolverFn() did not complete in 100 ms!]",
  );
});

test("throwing in onError during error", async () => {
  const onError = jest.fn().mockImplementation(() => {
    throw Error("Error in onError");
  });
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    onError,
    resolverFn: jest
      .fn()
      .mockRejectedValueOnce(Error("Errored in resolverFn"))
      .mockResolvedValueOnce("value"),
  });
  await cache.cached();
  expect(onError.mock.lastCall[0]).toMatchInlineSnapshot(
    "[Error: Errored in resolverFn]",
  );
});

test("refreshAndWait() multiple times", async () => {
  let i = 0;
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    resolverFn: jest.fn().mockImplementation(async () => {
      await delay(500);
      return `delayed ${i++}`;
    }),
  });
  await cache.refreshAndWait();
  expect(await cache.cached()).toBe("delayed 1");
  await cache.refreshAndWait();
  expect(await cache.cached()).toBe("delayed 2");
  await cache.refreshAndWait();
  expect(await cache.cached()).toBe("delayed 3");
});

test("destroy before cached()", async () => {
  cache = new CachedRefreshedValue({ ...OPTIONS, resolverFn: jest.fn() });
  cache.destroy();
  await expect(cache.cached()).rejects.toMatchInlineSnapshot(
    "[Error: CachedRefreshedValue: This instance is destroyed]",
  );
});

test("destroy before refreshAndWait()", async () => {
  cache = new CachedRefreshedValue({ ...OPTIONS, resolverFn: jest.fn() });
  cache.destroy();
  await expect(cache.refreshAndWait()).rejects.toMatchInlineSnapshot(
    "[Error: CachedRefreshedValue: This instance is destroyed]",
  );
});

test("destroy after cached()", async () => {
  cache = new CachedRefreshedValue({ ...OPTIONS, resolverFn: jest.fn() });
  await cache.cached();
  cache.destroy();
  await expect(cache.cached()).rejects.toMatchInlineSnapshot(
    "[Error: CachedRefreshedValue: This instance is destroyed]",
  );
});

test("destroy after refreshAndWait()", async () => {
  cache = new CachedRefreshedValue({ ...OPTIONS, resolverFn: jest.fn() });
  await cache.refreshAndWait();
  cache.destroy();
  await expect(cache.refreshAndWait()).rejects.toMatchInlineSnapshot(
    "[Error: CachedRefreshedValue: This instance is destroyed]",
  );
});

test("destroy stops resolverFn() calls", async () => {
  const resolverFn = jest.fn().mockResolvedValue("foo");
  cache = new CachedRefreshedValue({ ...OPTIONS, resolverFn });
  await cache.cached();
  cache.destroy();
  await delay(OPTIONS.delayMs * 5);
  expect(resolverFn).toBeCalledTimes(1);
});

test("refreshAndWait() returns fresh value", async () => {
  let resolveDeferred = pDefer();
  let delayDeferred = pDefer();
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    resolverFn: async () => {
      const val = await resolveDeferred.promise;
      resolveDeferred = pDefer();
      return val;
    },
    delay: async () => {
      await delayDeferred.promise;
      delayDeferred = pDefer();
    },
  });

  resolveDeferred.resolve("init");
  await cache.cached();

  await delay(1000);

  const freshValue = cache.refreshAndWait().then(async () => cache.cached());
  delayDeferred.resolve();
  resolveDeferred.resolve("fresh");
  expect(await freshValue).toBe("fresh");
});

test("refreshAndWait() skips in-flight value", async () => {
  let resolveCalled = pDefer();
  let resolveDeferred = pDefer();
  let delayDeferred = pDefer();
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    resolverFn: async () => {
      resolveCalled.resolve();
      resolveCalled = pDefer();
      const val = await resolveDeferred.promise;
      resolveDeferred = pDefer();
      return val;
    },
    delay: async () => {
      await delayDeferred.promise;
      delayDeferred = pDefer();
    },
  });

  resolveDeferred.resolve("init");
  await cache.cached();

  delayDeferred.resolve();
  await resolveCalled.promise;
  const freshValue = cache.refreshAndWait().then(async () => cache.cached());

  resolveDeferred.resolve("in-flight");
  delayDeferred.resolve();

  await resolveCalled.promise;
  resolveDeferred.resolve("fresh");

  expect(await freshValue).toBe("fresh");
});

test("refreshAndWait() skips delay", async () => {
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    resolverFn: jest
      .fn()
      .mockResolvedValueOnce("one")
      .mockResolvedValueOnce("two")
      .mockResolvedValueOnce("three")
      .mockResolvedValueOnce("everything else"),
    delay: async () =>
      // Never resolves!
      delay(1_000_000),
  });

  await cache.cached();

  await cache.refreshAndWait();
  expect(await cache.cached()).toBe("two");

  await cache.refreshAndWait();
  expect(await cache.cached()).toBe("three");
}, 10_000 /* timeout */);

test("changes in deps are respected", async () => {
  let depsValue = "some";
  cache = new CachedRefreshedValue({
    ...OPTIONS,
    deps: {
      delayMs: 10,
      handler: () => depsValue,
    },
    resolverFn: jest
      .fn()
      .mockResolvedValueOnce("one")
      .mockResolvedValueOnce("two"),
    delay: async () =>
      // Never resolves!
      delay(1_000_000),
  });

  expect(await cache.cached()).toEqual("one");

  depsValue = "other";
  await waitForExpect(async () => expect(await cache.cached()).toEqual("two"));
});

test("timer-triggered refreshes each run in a separate trace", async () => {
  // Models how an async_hooks based APM tracer derives a "trace id" from the
  // current async context: if a query runs with an active trace, it joins it;
  // otherwise (i.e. when the framework detached us into a fresh async context),
  // the tracer opens a brand-new trace AND pins it to the current context via
  // enterWith() (so it would "leak" into the next refresh and coalesce all
  // refreshes into one trace, were the detachment not restoring a clean
  // baseline on every iteration).
  const als = new AsyncLocalStorage<{ traceId: string }>();
  let detachedTraceSeq = 0;
  const traces: string[] = [];
  const recordTrace = (): void => {
    let store = als.getStore();
    if (!store) {
      store = { traceId: `detached-trace-${++detachedTraceSeq}` };
      als.enterWith(store);
    }

    traces.push(store.traceId);
  };

  cache = new CachedRefreshedValue({
    ...OPTIONS,
    delayMs: 10,
    resolverFn: async () => {
      recordTrace();
      return "value";
    },
  });

  // The very 1st refresh is triggered synchronously by this cached() call (akin
  // to the 1st query), so it must run in (and thus inherit) the caller's trace.
  await als.run({ traceId: "caller-trace" }, async () => cache.cached());

  // Let several timer-triggered refreshes happen.
  await waitForExpect(() => expect(traces.length).toBeGreaterThanOrEqual(4));

  expect(traces[0]).toBe("caller-trace");

  // Every subsequent (timer-triggered) refresh ran detached from the caller's
  // trace, and each one got its own brand-new trace.
  const timerTraces = traces.slice(1);
  expect(
    timerTraces.every((trace) => trace.startsWith("detached-trace-")),
  ).toBe(true);
  expect(new Set(timerTraces).size).toBe(timerTraces.length);
});

test("manual refreshAndWait() keeps the caller's trace", async () => {
  const als = new AsyncLocalStorage<{ traceId: string }>();
  let detachedTraceSeq = 0;
  const traces: string[] = [];
  const recordTrace = (): void => {
    let store = als.getStore();
    if (!store) {
      store = { traceId: `detached-trace-${++detachedTraceSeq}` };
      als.enterWith(store);
    }

    traces.push(store.traceId);
  };

  cache = new CachedRefreshedValue({
    ...OPTIONS,
    // Large delay, so no timer-triggered refresh interferes: only the initial
    // refresh and the manual refreshAndWait() ones happen.
    delayMs: 1_000_000,
    resolverFn: async () => {
      recordTrace();
      return "value";
    },
  });

  await als.run({ traceId: "caller-trace" }, async () => {
    await cache.cached(); // initial refresh
    await cache.refreshAndWait(); // manual rediscovery
    await cache.refreshAndWait(); // manual rediscovery
  });

  // Neither the initial nor the manual refreshes were detached into a fresh
  // trace: they all kept running in the loop's (caller's) trace.
  expect(traces).toEqual(["caller-trace", "caller-trace", "caller-trace"]);
});
