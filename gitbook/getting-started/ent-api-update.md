# Ent API: update\*()

Previously, we looked at Ent Framework APIs which were "per Ent class", represented as Ent static methods.

In contrast, `update*()` calls are Ent instance methods. It means that, to update an Ent, you first need to load that Ent in memory. This achieves 2 goals:

1. It brings some extra privacy protection, since to load an Ent, the VC needs to have permissions to do so.
2. It enables you to build sophisticated "mutation" privacy checks, since Ent Framework has access to both the old (before update) and the new (after update) Ent fields.

There is one caveat though: Ent instances are immutable, so `update*()` methods to not change their fields in memory. Instead, they act as "mutations" by modifying the data in the database, and then, if you request so, loading the updated rows back and returning them to you.

* **ent.updateOriginal({ field1: "value1", ... }): boolean**: updates the row in the database corresponding to `ent.id` ID. Does not modify any fields of `ent` instance, since it's immutable. Runs all the needed privacy checks and Ent Framework triggers (we'll discuss both topics later in advanced chapters). Returns true if the row existed in the database at the moment of the update and false otherwise.
* **ent.updateReturningX({ field1: "value1", ... }): Ent**: updates the row in the database,  then **loads the Ent back** using `loadX()` and returns it to you. In case there was no such row in the database, throws an exception (this is what "X" stands for). Since this methods runs 2 database queries under the hood, any side effects applied by e.g. native PostgreSQL triggers will refect in the loaded Ent.
* **ent.updateReturningNullable({ field1: "value1", ... }): Ent | null**: similarly to `updateReturningX()`, updates the row in the database and loads the updated Ent back, but doesn't throw in case you are trying to update a row which doesn't exist at the moment.
*   **ent.updateChanged({ field1: "...", field2: "..." }): \[] | null | false**:&#x20;

    same as `updateOriginal()`, but updates only the fields which are different in input and in the current object. If there was no such row in the database, returns false, the same way as `updateOriginal()` does. If no changed fields were detected, returns null as an indication (it's still falsy, but is different from the parent `updateOriginal()'s` false). Otherwise, when an update happened, returns the list of fields which were different and triggered that change (a truthy value).
