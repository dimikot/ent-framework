# Load Ents by ID

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

* **`loadNullable(vc, id)`**: loads an Ent by ID if it exists in the database, otherwise returns null.
* **`loadX(vc, id)`**:  loads an Ent by ID. Throws `EntNotFoundError` if there is no such Ent in the database.

{% hint style="info" %}
In most of the cases, prefer `loadX()` and not `loadNullable()` with manual null-checking. Let the framework do its job.
{% endhint %}

There is intentionally no method which loads multiple Ents at once taking an array of IDs. Read further on, why.
