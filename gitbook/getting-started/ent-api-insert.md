# Ent API: insert\*()

Ent Framework exposes an opinionated API which allows to write and read data from the microsharded database.

{% code title="app/api/topics/route.ts" %}
```typescript
import { EntComment } from "@/ents/EntComment";
import { EntTopic } from "@/ents/EntTopic";
import { EntUser } from "@/ents/EntUser";
import { getServerVC } from "@/ents/getServerVC";
import { NextApiRequest } from "next";
import { NextResponse } from "next/server";

export async function POST(req: NextApiRequest) {
  const vc = await getServerVC();
  const user = await EntUser.loadX(vc, vc.principal);
  const topic = await EntTopic.insertReturning(vc, {
    slug: `t${Date.now()}`,
    creator_id: user.id,
    subject: String(req.body.subject || "My Topic"),
  });
  const commentID = await EntComment.insert(topic.vc, {
    topic_id: topic.id,
    creator_id: user.id,
    message: String(req.body.subject || "My Message"),
  });
  return NextResponse.json({
    message: `Created topic ${topic.id} and comment ${commentID}`,
  });
}
```
{% endcode %}

There are several versions of `insert*` static methods on each Ent class.

## **insertIfNotExists(vc, { field: "...", ... }): string | null**

inserts a new Ent and returns its ID or null if the Ent violates unique index constraints. This is a low-level method, all other methods use it internally.

## **insert(vc, { field: "...", ... }): string**

Inserts a new Ent and returns its ID.

Throws `EntUniqueKeyError` if it violates unique index constraints. Always returns an ID of just-inserted Ent.

## **insertReturning(vc, { field: "...", ... }): Ent**

Same as `insert()`, but immediately loads the just-inserted Ent back from the database and returns it. The reasoning is that the database may have fields with default values or even PG triggers, so we always need 2 round-trips to get the actual data.

{% hint style="info" %}
In fact, `insert*()` methods do way more things. They check privacy rules to make sure that a VC can actually insert the data. They call Ent triggers. They infer a proper microshard to write the data to. We'll discuss all those topics later.
{% endhint %}

## VC Embedding

When some Ent is loaded in a VC, its `ent.vc` is assigned to that VC. In the above example, we use `req.vc` and `topic.vc` interchangeably.\
\
**Embedding a VC into each Ent is a crucial aspect of Ent Framework.** It allows to remove **lots** of boilerplate from the code. Instead of passing an instance of some VC everywhere from function to function, we can just pass Ents, and we'll always have an up-to-date VC:

```typescript
async function loadTopicOfComment(comment: EntComment) {
  return EntTopic.loadX(comment.vc, comment.topic_id);
}

async function loadTopicOfCommentUglyDontDoItPlease(vc: VC, commentID: string) {
  return EntTopic.loadX(vc, commentID);
}
```

You almost never need to pass a VC from function to function: pass Ent instances instead. Having an explicit `vc` argument somewhere is a smell.
