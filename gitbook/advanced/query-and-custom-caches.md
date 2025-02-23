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

Overall, query caching works the way you expect it to work. As a concept, reading through the cache is sligtly similar to reading from a replica DB (see [replication-and-automatic-lag-tracking.md](../scalability/replication-and-automatic-lag-tracking.md "mention")): you may get the stale data, but Ent Framework does its best to prevent that when possible.
