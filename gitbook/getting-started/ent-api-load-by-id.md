# Ent API: load\*() by ID

There is a basic primitive used very frequently: having some Ent ID, load this Ent into memory.

{% code title="entry.ts" %}
```typescript
import { app } from "./core/app";
import { EntComment } from "./ents/EntComment";
...
app.get("/comments/:id", async (req, res) => {
  const comment = await EntComment.loadX(req.vc, req.params.id);
  res.json({ message: comment.message });
});
```
{% endcode %}

There are several versions of `load*` static methods on each Ent class:

## **Ent.loadX(vc, id): Ent**

Loads an Ent by ID.

Throws `EntNotFoundError` if there is no such Ent in the database, or `EntNotReadableError` if the VC has no permissions to read it.

## **Ent.loadNullable(vc, id): Ent | null**

loads an Ent by ID if it exists in the database, otherwise returns null.&#x20;

If an Ent with such ID exists, but the VC doesn't have permissions to access it, the call will throw `EntNotReadableError`.

## **Ent.loadIfReadableNullable(vc, id)**: Ent | null

This is a special method which returns `null` not only when an Ent with such ID doesn't exist, but also if you have to permissions to read it. Basically, it never throws. Permissions are governed by Ent `privacyLoad` rules. These were briefly mentioned earlier and will be discussed in greater detail later.

{% hint style="info" %}
In most of the cases, prefer `loadX()` and rely on the outer try-catch blocks, as opposed to `loadNullable()` with manual null-checking. Let the framework do its job. And you likely almost never need to use `loadIfReadableNullable()`: it's a smell.
{% endhint %}

There is intentionally no method which loads multiple Ents at once taking an array of IDs. Read further on, why.
