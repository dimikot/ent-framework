# Ent API: insert\*()

Ent Framework exposes an opinionated API which allows to write and read data from the microsharded database.

<pre class="language-typescript" data-title="entry.ts"><code class="lang-typescript">import { app } from "./core/app";
import { EntComment } from "./ents/EntComment";
import { EntTopic } from "./ents/EntTopic";
<strong>
</strong>app.post("/topics", async (req, res) => {
  const topic = await EntTopic.insertReturning(req.vc, { 
    slug: String(req.body["slug"]),
    creator_id: req.vc.principal,
  });
  const commentID = await EntComment.insert(topic.vc, {
    topic_id: topic.id,
    creator_id: req.vc.principal,
    message: String(req.body["message"]),
  });
  res.send(`Created topic ${topic.id} and comment ${commentID}`);
});
</code></pre>

There are several versions of `insert*` static methods on each Ent class.

## **insertIfNotExists(vc, row): string | null**

inserts a new Ent and returns its ID or null if the Ent violates unique index constraints. This is a low-level method, all other methods use it internally.

## **insert(vc, row): string**

Inserts a new Ent and returns its ID.

Throws `EntUniqueKeyError` if it violates unique index constraints. Always returns an ID of just-inserted Ent.

## **insertReturning(vc, row): Ent**

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
