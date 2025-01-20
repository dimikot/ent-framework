# VC: Viewer Context and Principal

One of the most important Ent Framework traits is that it always knows, "who" is sending some read/write query to the database, and is able to check permissions. Typically, that "who" is a user who opens a web page, or on behalf of whom a background worker job is running, but it can be any other **Principal**. This mechanism is quite different from traditional database abstraction layers or ORMs, which typically lack awareness of the specific user on whose behalf the queries are executed.

To send a query, you must always have an instance of [VC](https://github.com/clickup/ent-framework/blob/main/docs/classes/VC.md) class in hand (stands for **Viewer Context**). The most important property in a VC is `principal`, it's a string which identifies the party who's acting. Typically, we store some user ID in `vc.principal`.

It is intentionally not easy to create a brand new VC instance. In fact, you should only do it once in your app (this VC is called "root VC"), and all other VCs created should **derive** from that VC using its methods.

Below is a basic example for [Next.js](https://nextjs.org/) framework. (Of course you can use any other framework like Express or whatever. Next.js is here only for illustrative purposes, it has nothing to do with Ent Framework.)

## Integrate with e.g. Google Auth

For simplicity of the example, we'll plug in "Login with Google" feature to our Next app, and then will use the user's email as a primary method of addressing an EntUser.

{% code title="app/api/auth/[...nextauth]/route.ts" %}
```typescript
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_ID,
      clientSecret: process.env.GOOGLE_SECRET,
    }),
  ],
});

export { handler as GET, handler as POST };
```
{% endcode %}

Now on any page, you may place a [Sign in button component](../../examples/next-example/src/components/SignInButton.tsx):

{% code title="components/SignInButton.tsx" %}
```typescript
import { signIn } from "next-auth/react";
...
<a onClick={() => signIn("google")}>Sign in</a>
```
{% endcode %}

Next.js exposes `getServerSession()` function for server components, to allow you access the session data of the user, including their email:

{% code title="app/page.tsx" %}
```typescript
import { getServerSession } from "next-auth";

export default async function Home() {
  const session = await getServerSession();
  return session ? (
    <div>Welcome, {session.user?.name}!</div>
  ) : (
    <div>Please sign in to continue.</div>
  );
}
```
{% endcode %}

You can also use `getServerSession()` from inside of your API route handlers.

## Build a Request VC Accessor Function

The same way as `getServerSession()` gives us access to the user's session, let's build a function that returns a VC instance for that user. Technically, this function should work exactly the same way as `getServerSession()`: it will even use `session.user.email` field from there.

And in case the user is not authenticated yet, we still need a "guest VC" to be returned by this function. Such VC can still access some "public" Ents (depending on their privacy rules).

The VC instance should be "memoized" per the HTTP request, so if the VC accessor function is called multiple time, it should return the same object. This is critical: otherwise, many Ent Framework features (like queries batching and caching) will just not work as they should.

Different frameworks have different ways of attaching a property to the request object. In Next, the easiest way so far is to use `WeakMap` and `headers()` API function. (In Express, you would likely just assign a value to `req.vc` in some middleware.)

{% code title="ents/getServerVC.ts" %}
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
      // automatically assigned to a new derived VC with principal equals to
      // user.id.
      vc = user.vc;
    }
    vcStore.set(heads, vc);
  }
  return vc;
}
```
{% endcode %}

We will discuss what `loadByX()` is in the next sections. In short, it **loads** an Ent **by** unique key and throws an e**X**ception (this is what "X" stands for) if it doesn't exist.

Here comes the catch: `loadByX()` requires to pass a VC whose principal is the user loading the data. And to derive that VC, we need to call `EntUser#loadByX()`. In our case, it's obviously a "chicken and egg" problem, so we just derive a new VC in "god mode" with `vc.toOmniDangerous()` and allow Ent Framework to bypass privacy checks for the very 1st `EntUser` loaded.

## Use getServerVC() in Your Server Components and APIs

So now, everywhere you could use `getServerSession()`, you can use `getServerVC()` as well.

For instance, in a server component:

{% code title="app/page.tsx" %}
```typescript
import { getServerVC } from "@/ents/getServerVC";

export default async function Home() {
  const vc = await getServerVC(); // <---
  return session ? (
    <div>Your vc.principal={vc.principal}.</div>
  ) : (
    <div>Please sign in to continue.</div>
  );
}
```
{% endcode %}

Or in an API route handle:

{% code title="app/api/topics/route.ts" %}
```typescript
import { EntTopic } from "@/ents/EntTopic";
import { getServerVC } from "@/ents/getServerVC";
import { NextApiRequest } from "next";
import { NextResponse } from "next/server";

export async function POST(req: NextApiRequest) {
  const vc = await getServerVC(); // <---
  const topic = await EntTopic.insertReturning(vc, {
    slug: `t${Date.now()}`,
    creator_id: vc.principal,
    subject: req.body.subject,
  });
  return NextResponse.json({ id: topic.id });
}
```
{% endcode %}

In other frameworks, you would access the per-request VC differently. For instance, in Express, you would likely just read `req.vc` value that you earlier assigned in a middleware.
