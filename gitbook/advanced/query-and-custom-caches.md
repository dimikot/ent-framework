# Query and Custom Caches

Ent Framework supports _in-VC LRU query caching_ for all read API calls (like `loadX()`, `loadBy*()`, `select()` etc.):

```typescript
// Somewhere in early stage of the request lifecycle:
// enable Ent query caching.
const vc = user.vc.withFlavor(new VCWithQueryCache({
  maxQueries: 1000,
}));

const topic1 = await EntTopic.loadX(vc, topicID);
const topic2 = await EntTopic.loadX(vc, topicID); // no DB queries sent!
```

By default, the cache is not enabled: to activate it, add a VC flavor `VCWithQueryCache` early  in the request lifecycle.

* Once enabled, all of the read results will be saved in an internal store associated with the VC.
* Since VC is immutable, the store is not inherited when you derive a VC from the current VC, e.g. with `toOmniDangerous()` or `withFlavor()`. I.e. the new VC will appear with empty caches.
* Every write (like `insert*()`, `update*()` or `deleteOriginal()` calls) will also invalidate the caches. Ent Framework tries to do it intelligently: if you e.g. update a particular Ent, only the `load*()` cache related to the same ID will be cleaned.
* Writes happened in one VC do not affect caches stored in other VCs (even derived ones). Be careful.
* You can create a derived VC with empty caches and no other changes, by using `newVC = vc.withEmptyCache()`.

Overall, query caching works the way you expect it to work. As a concept, reading through the cache is sligtly similar to reading from a replica DB (see [replication-and-automatic-lag-tracking.md](../scalability/replication-and-automatic-lag-tracking.md "mention")): you may get the stale data, but Ent Framework does its best to prevent that when possible.

Notice that the VC caches are very short-lived: they are not stored externally (no files, no Redis etc.) and exist in Node process memory only.

## Custom Caches

In addition to built-in query caching, you may utilize your own in-VC caches with `VC#cache()` API. This is convenient when Ent Framework's built-in capabilities are not enough, or you want to cache the data related to other databases.

First, define the _cache store_ for your use case. Often times, the simplest way is to just extend the JS built-in `Map` class, but you can use any other store (like [quick-lru](https://www.npmjs.com/package/quick-lru)) or even implement your own store the way you want.

```typescript
export class MyStore extends Map<string, string> {
  constructor(private vc: VC) {
    super();
  }
}
```

Once you have a store class with a constructor that accepts a VC insrance, you can use it with `cache()` API:

```typescript
const store = vc.cache(MyStore);
if (!store.has(myKey)) {
  store.set(myKey, myValue);
}
return store.get(myKey)!;
```

When you call `vc.cache(MyStore)` the very 1st time for the VC, Ent Framework will create an instance of `MyStore` class and save it in the VC itself. Next time you run `vc.cache(MyStore)`, it will find that store instance and return it to you.

The store class itself plays the role of the store identification within the VC. So if you have 2 independent store classes, they will not collide.

If you don't like classes, use a special _tagged_ version of `cache()` call:

```typescript
const $MY_STORE = Symbol("$MY_STORE");
...
myMethod() {
  const store = vc.cache(
    $MY_STORE,
    () => new Map<string, string>(),
  );
  if (!store.has(myKey)) {
    store.set(myKey, myValue);
  }
  return store.get(myKey)!;
}
```

Here, `$MY_STORE` symbol will play the same identification role as `MyStore` class itself in the previous example.

Overall, `cache()` call does nothing more than "memoizing" an instance of your store container in a particular VC. It's up to you, how to utilize that store instance, be it a key-value container or something else.
