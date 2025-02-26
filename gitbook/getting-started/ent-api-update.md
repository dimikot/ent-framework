# Ent API: update\*()

Previously, we looked at Ent Framework APIs which were "per Ent class", represented as Ent static methods.

In contrast, `update*()` calls are Ent instance methods. It means that, to update an Ent, you first need to load that Ent in memory. This achieves 2 goals:

1. It brings some extra privacy protection, since to load an Ent, the VC needs to have permissions to do so.
2. It enables you to build sophisticated "mutation" privacy checks, since Ent Framework has access to both the old (before update) and the new (after update) Ent fields.

There is one caveat though: Ent instances are immutable, so `update*()` methods do not change their fields in memory. Instead, they act similarly to "GraphQL mutations" by modifying the data in the database, and then, if you request so, loading the updated rows back and returning them to you.

This is why all `update*()` methods have vernose suffixes in their names.

## **ent.updateOriginal({ field: "...", ... }): boolean**

Updates the row in the database corresponding to `ent.id` ID. Does not modify any fields of `ent` instance, since it's immutable.&#x20;

Runs all the needed privacy checks and Ent Framework triggers (we'll discuss both topics later in advanced chapters). In case there are no `privacyUpdate` rules defined in the Ent class configuration, delegates privacy checking to `privacyInsert` rules.

Returns true if the row existed in the database at the moment of the update and false otherwise.

As always, when multiple `update*()` calls run in parallel, Ent Framework batches them into a single SQL query:

```typescript
const [updated1, updated2] = await Promise.all([
  topic1.updateOriginal({ subject: "some" }),
  topic2.updateOriginal({ subject: "text" }),
]);
```

**This results into the following batched query sent to the database (the actual query is even more complicated actually, but you can see the general idea below):**

```sql
WITH rows(id, subject) AS (VALUES(
  ('123', 'some'),
  ('456', 'text'))
  UPDATE topics SET subject=rows.subject
  FROM rows WHERE topic.id=rows.id
  RETURNING rows.id
```

{% hint style="info" %}
All `update*()` functions also support a special `$cas` property; read more about it in [atomic-updates-and-cas.md](../advanced/atomic-updates-and-cas.md "mention") advanced article.
{% endhint %}

## **ent.updateReturningX({ field: "...", ... }): Ent**

Updates the row in the database,  then **loads the Ent back** using `loadX()` and returns it to you. In case there was no such row in the database, throws `EntNotFound` error (this is what "X" stands for, "eXception").

Since this methods runs 2 database queries under the hood, any side effects applied by e.g. native PostgreSQL triggers will refect in the loaded Ent.

As of batching, it also results into running  just 2 SQL queries, no matter how many Ents are updated in parallel. The first query is the batched `updateOriginal()`, and the second one is the batched `loadX() for the resulting Ents`:

```sql
WITH rows(id, subject) AS (VALUES(
  ('123', 'some'),
  ('456', 'text'))
  UPDATE topics SET subject=rows.subject
  FROM rows WHERE topic.id=rows.id
  RETURNING rows.id;

SELECT * FROM topics WHERE id IN('123', '456');
```

## **ent.updateReturningNullable({ field: "...", ... }): Ent | null**

Similarly to `updateReturningX()`, updates the row in the database and loads the updated Ent back, but doesn't throw in case you are trying to update a row which doesn't exist at the moment.

## **ent.updateChanged({ field1: "...", field2: "...", ... }): string\[] | null | false**

Same as `updateOriginal()`, but updates only the fields which are different in the method's input and in the current Ent instance in memory.

* If there is no such row in the database, returns false, the same way as `updateOriginal()` does.
* If no changed fields were detected, returns null as an indication (it's still falsy, but is different from the parent `updateOriginal()'s` false).&#x20;
* Otherwise, when an update happened, returns the list of fields which were different and triggered that change (a truthy value).

## **ent.updateChangedReturningX({ field: "...", ... }): Ent**

This is probably the longest method name in Ent API. Acts similarly to `updateChanged()`, but returns the modified Ent back (or the original Ent if no fields were actully changed).

## Using $literal Instead of Fields

In addition to updating particular fields by their names, you can also pass an arbitrary SQL piece containing one more comma separated `field = value` expressions:

```typescript
await topic.updateOriginal(vc, {
  subject: "some",
  $literal: [
    "tags = ARRAY(SELECT DISTINCT unnest FROM unnest(array_append(tags, ?)))",
    "my-tag",
  ]
});
```

In the final SQL query generated, what you pass in `$literal` will appear as it is:

```sql
UPDATE topics
SET
  subject = 'some',
  tags = ARRAY(SELECT DISTINCT unnest FROM unnest(array_append(tags, 'my-tag')))
WHERE id = 1004200047373526525
```

There are several downsides of this approach though:

1. Calls of this kind can't be batched, so if you run multiple of them in parallel, Ent Framework will send independent queries.
2. The syntax is engine-specific; e.g. the above example works for PostgreSQL only.

