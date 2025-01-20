# Ent API: load\*() by ID

There is a basic primitive used very frequently: having some Ent ID, load this Ent into memory.

{% code title="app/api/comments/[id]/route.ts" %}
```typescript
import { EntComment } from "@/ents/EntComment";
import { getServerVC } from "@/ents/getServerVC";
import { NextApiRequest } from "next";
import { NextResponse } from "next/server";

export async function GET(
  _req: NextApiRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const vc = await getServerVC();
  const comment = await EntComment.loadX(vc, (await params).id);
  return NextResponse.json({ message: comment.message });
}
```
{% endcode %}

There are several versions of `load*` static methods on each Ent class:

## **Ent.loadX(vc, id): Ent**

Loads an Ent by ID.

Throws `EntNotFoundError` if there is no such Ent in the database, or `EntNotReadableError` if the VC has no permissions to read it.

## **Ent.loadNullable(vc, id): Ent | null**

loads an Ent by ID if it exists in the database, otherwise returns null.

If an Ent with such ID exists, but the VC doesn't have permissions to access it, the call will throw `EntNotReadableError`.

## **Ent.loadIfReadableNullable(vc, id)**: Ent | null

This is a special method designed to return `null` in two cases: when an Ent with the specified ID does not exist, or when the user lacks the necessary permissions to read it. Basically, it never throws.

Permissions are enforced by the `privacyLoad` rules of the Ent, which were briefly introduced earlier and will be covered in more detail later.

{% hint style="info" %}
In most of the cases, prefer `loadX()` and rely on the outer try-catch blocks, as opposed to `loadNullable()` with manual null-checking. Let the framework do its job. And you likely almost never need to use `loadIfReadableNullable()`: it's a smell.
{% endhint %}

There is intentionally no method which loads multiple Ents at once taking an array of IDs. Read further on, why.
