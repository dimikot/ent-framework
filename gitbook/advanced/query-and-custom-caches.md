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

## Enable Query Cache in a Next App

Earlier in [vc-flavors.md](vc-flavors.md "mention"), we updated our `getServerVC()` function example to attach additional flavors to the per-request VC. Let's modify it further to enable query caching.

```typescript
import { VC } from "ent-framework";
import { getServerSession } from "next-auth";
import { headers } from "next/headers";
import { EntUser } from "./EntUser";

const vcStore = new WeakMap<object, VC>();

export async function getServerVC(): Promise<VC> {
  const [heads, session] = await Promise.all([headers(), getServerSession()]);
  let vc = vcStore.get(heads);
  if (!vc) {
    vc = VC.createGuestPleaseDoNotUseCreationPointsMustBeLimited();
    if (session?.user?.email) {
      const vcOmni = vc.toOmniDangerous();
      let user = await EntUser.loadByNullable(vcOmni, {
        email: session.user.email,
      });
      if (!user) {
        // User did not exist: upsert the Ent.
        await EntUser.insertIfNotExists(vcOmni, {
          email: session.user.email,
          is_admin: false,
        });
        user = await EntUser.loadByX(vcOmni, {
          email: session.user.email,
        });
      }
      // Thanks to EntUser's privacyInferPrincipal rule, user.vc is
      // automatically assigned to a new derived VC with principal
      // equals to user.id. We also attach flavors here and enable
      // the built-in query caching.
      vc = user.vc.withFlavor(
        new VCWithQueryCache({ maxQueries: 1000 }), // <--
        new VCEmail(user.email),
        user.is_admin ? new VCAdmin() : undefined,
      );
    }
    vcStore.set(heads, vc);
  }
  return vc;
}
```

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

## Privacy Rules Caching

At this point, it won't be a surprise for you that Ent Framework privacy checking layer (see [privacy-rules.md](../getting-started/privacy-rules.md "mention")) uses the VC caching engine described above. In particular, once some Ent ID is determined to be readable in a VC (`privacyLoad` rules), then all future checks within that VC are bypassed. The same applies to `privacyUpdate` and `privacyDelete`. Since Ents and VCs are immutable, we can safely rely on that machinery.

In practice, the caching for privacy rules works quite effectively: you'll rarely see too many additional database requests that Ent Framework issues for privacy checking.

Privacy caching also enables one interesting feature: if you, say, load an Ent in a VC and then soft-delete it (by setting its `deleted_at` field to the current time or to `true`, depending on your business logic), then you will still be able to reload that Ent in the same VC, even if its privacy rules block reading of soft-deleted rows. This is because when you read an Ent, you have already "proven" that you have access to it, so Ent Framework will bypass all the further checks related to the same VC.
