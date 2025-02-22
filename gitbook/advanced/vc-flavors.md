# VC Flavors

VC (stands for "Viewer Context") is one of Ent Framework's core abstractions. As described in [vc-viewer-context-and-principal.md](../getting-started/vc-viewer-context-and-principal.md "mention") article, it represents an "acting user". More precisely, it is actually an "acting principal", since it may not necessarily be a user: for e.g. background jobs, people often use other "owning" objects, like a company or a workspace, depending on the app's business logic.

## VC Principal

Early in a request cycle, you create an instance of VC and then use it everywhere else in the code to load Ents:

```typescript
// Early in your request processing lifecycle:
const guestVC = VC.createGuestPleaseDoNotUseCreationPointsMustBeLimited();
const user = await EntUser.loadX(guestVC.toOmniDangerous(), {
  email: session.user.email,
});

// Every Ent carries the VC that was used to load it. In case
// we used an omni VC, then it is "downgraded" to a "less
// powerfull" VC right after loading; see privacyInferPrincipal
// configuration option on Ent classes.
vc = user.vc;

// Later in all other code:
const user = await EntUser.loadX(vc, vc.principal);
const topic = await EntTopic.loadX(user.vc, topicID);
const comments = await EntComment.select(topic.vc, ...);
```

Every VC instance has `principal` property, a raw string that identifies, who's acting. Here are some common values for it:

1. `"10042000123456789"`, i.e. some Ent's ID: used in absolute most of the cases (like user ID or company ID). It is more a convention rather than a rule though.
2. `"omni"`: if you call `vc.toOmniDangerous()`, the returned VC will have that value in its `principal` property. (The original VC remains immutable.) Omni VCs bypass all privacy rules.
3. `"guest"`: such VC is created by `vc.toGuest()` call or with `createGuestPleaseDoNotUseCreationPointsMustBeLimited()`  static method. It cannot load or update anything by default, unless explicitly allowed with e.g. `AllowIf(new True())` privacy rule.

When you want to get s VC with particular principal in your code, you typically _derive_ it from some existing VC by using the methods mentioned above. This enables keeping the knowledge about the derivation chain.

## Flavors

In addition to `vc.principal` property, it is often times convenient to store some auxiliary information in a VC. You can do it by adding _flavors_, instances of classes derived from `VCFlavor`:

```typescript
/**
 * A flavor that carries an auxiliary email.
 */
export class VCEmail extends VCFlavor {
  constructor(public readonly value: string) {
    super();
  }

  override toDebugString() {
    return this.value;
  }
}

/**
 * A flag-like flavor that enables reading of soft-deleted
 * Ents (e.g. Ents with deleted_at set to non-null).
 */
export class VCCanReadSoftDeletedEnts extends VCFlavor {
  override toDebugString() {
    return "read-soft-deleted";
  }
}

/**
 * A flag-like flavor that our app may check to allow reading
 * or writing of any Ent.
 */
export class VCAdmin extends VCFlavor {
  override toDebugString() {
    return "admin";
  }
}
```

Typically, you store any arbitrary properties in your flavor instance and then derive a new VC by attaching the flavor:

```typescript
const derivedVC = vc.withFlavor(
  new VCEmail("test@example.com"),
  new VCCanReadSoftDeletedEnts(),
);
const topic = EntTopic.loadX(derivedVC, softDeletedTopicID);
```

You can then read the flavor back in your code (e.g. in privacy rule predicates) to make decisions:

```typescript
import { VCHasFlavor } from "ent-framework";
...
privacyLoad: [
  new AllowIf(new VCHasFlavor(VCAdmin)),
  new AllowIf(async function CanReadSoftDeletedEnt(vc, row) {
    const flavor = vc.flavor(VCCanReadSoftDeletedEnts);
    return row.deleted_at !== null && flavor !== null;
  }),
  ...
],
...
```

Notice that `vc.flavor(Class)` returns an instance of `Class` flavor associated with the VC, or `null` if there was no such flavor attached.

## VC#toString() and Flavors

Each class derived from `VCFlavor` may have a `toDebugString()` method overridden. When you call `vc.toString()` or `vc.toAnnotation()` , all the flavors in the VC are enumerated, and the values returned by `toDebugString()` are glued together, so the final result looks like:

```typescript
console.log(derivedVC.toString());
console.log(derivedVC.toAnnotation().vc);
// Both print:
// vc:10042000123456789(test@example.com,read-soft-deleted)
```

This is extremely convenient: in your query logs, you likely save the result of `vc.toAnnotation()`, so with e.g. `VCEmail`, you immediately see, who is sending the queries.

## Example: Attaching Flavors in a Next App

In [vc-viewer-context-and-principal.md](../getting-started/vc-viewer-context-and-principal.md "mention") article, we provided the code for `getServerVC()` helper function that can be used in a Next app to derive the request VC. Let's amend it to include `VCEmail` helper flavor.

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
      // equals to user.id. We also attach flavors here.
      vc = user.vc.withFlavor(
        new VCEmail(user.email),
        user.is_admin ? new VCAdmin() : undefined,
      );
    }
    vcStore.set(heads, vc);
  }
  return vc;
}
```

## Flavors and Security

Flavors engine is not limited to auxiliary or debug purposes only: it may also be used on the app's privacy checking critical path.

E.g. a flavor can be used as a _proof of identity_. In all previous examples, we used `vc.toOmniDangerous()` to load the very first EntUser in our request lifecycle, to avoid the "chicken and an egg" problem ("to load a user, you need a VC that can do it, and to derive that VC, you need an EntUser instance loaded"). Once the above is done, we wrote the user's ID to `vc.principal` and then _assumed_ that the VC is allowed to behave on behalf of that user, fully trusting the value in `vc.principal`.

It is not the only way to create the initial acting VC though. Ask yourself: what kind of _proof_ do we need to load an arbitrary EntUser? How does the backend do it naturally? The answer is that you must have some kind of a _secret_ in hands, like the user's password salted hash, or the user's token stored in a cookie, or an OAuth2 token. If you put that "proof" in a favor, then you can use it in EntUser's privacy rules to unlock the loading without ever calling to `vc.toOmniDangerous()`:

```typescript
class VCIdentityProof extends VCFlavor {
  #cookieToken: string;
  
  constructor(
    public readonly email: string,
    cookieToken: string,
  ) {
    super();
    this.#cookieToken = cookieToken;
  }
  
  override toDebugString() {
    // Do NOT expose #cookieToken!
    return this.email;
  }
}

class EntUser extends ... {
  ...
  privacyLoad: [
    new AllowIf(async function HasValidIdentityProof(vc, row) {
      const flavor = vc.flavor(VCIdentityProof);
      return row.email === flavor.email &&
        row.cookie_token === flavor.cookieToken;
    }),
    ...
  ],
  ...
}
```

So instead of using `toOmniDangerous()` in your initialization code, you may just attach the proof of identity flavor to a VC:

```typescript
// Pseudo-code:
const cookieStore = await cookies();
const guestVC = VC.createGuestPleaseDoNotUseCreationPointsMustBeLimited()
  .withFlavor(new VCIdentityProof(email, cookieStore.get("token")));
const user = await EntUser.loadByX(vc, { email });
return user.vc;
```

If you want even more or security, you may store a HMAC of the cookie token in `VCIdentityProof` flavor instead of the token itself, and then use _HMAC verification_ instead of `===` operator. In that case, even if the flavor payload is leaked, you'll face no harm.

Then, in privacy rules of the rest of your Ents, you delegate checking to the privacy rules of the parent EntUser (or of a parent Ent, considering that it delegates the checks to its owning EntUser). I.e. proceed with utilizing the standard privacy chain supported by Ent Framework.

A slight downside of this approach is that you'll always be having `vc.principal` equal to `"guest"`  in this case, but it also makes sense: until "a guest" really "proves" that the VC has permissions to load an EntUser, it can't load the Ent.
