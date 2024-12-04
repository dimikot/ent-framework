# Ent API: deleteOriginal()

Similar to `update*()` calls, `deleteOriginal()` is a method of Ent instance.

## ent.deleteOriginal(): boolean

Deletes a row in the database whose ID equals to `ent.id`. Returns true if the object was found.&#x20;

Before deleting the row, `deleteOriginal()` runs all privacy checks defined in the Ent class configuration, making sure `ent.vc` has permissions to delete the Ent. In case there are no privacy checks defined for deletion (no `privacyDelete`), uses `privacyUpdate` rules for the verification, and if it's also undefined, delegates to `privacyInsert`.

Since all Ent instances are immutable, the call keeps the current Ent instance unchanged. This is why it's called `deleteOriginal()` and not just `delete()` — because it's basically a mutation of the source.

And yes, to delete an Ent, you first need to load it (using e.g. `loadX()`, `select()` or any other call). Also, there is intentionally no way to delete Ents in bulk: you can only delete a single Ent (concurrent deletion calls are batched into one SQL query as usual though, so it's efficient).

