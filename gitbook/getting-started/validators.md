# Validators

Validators are predicates, similar to what you use in  `privacyInsert/Update` [privacy-rules.md](privacy-rules.md "mention"). They are called at the same time, and the error messages (if any) are accumulated to build and throw a compound `EntValidationError` instance.

## Field Validators

Field validators are executed on every `insert*()`  and `upsert*()` call.

Also, they are fired when an `update*()` call touches the fields that the validators are attached to. The untouched fields do not trigger re-validation.

```typescript
export class EntComment extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      privacyLoad: [...],
      privacyInsert: [...],
      validators: [
        new FieldIs(
          "message",
          (value, _row, _vc) => value.trim().length > 0,
          "Please provide comment text",
        ),
        new FieldIs(
          "topic_id",
          async (value, _row, vc) => {
            const topic = await EntTopic.loadX(vc, value);
            return Date.now() - topic.created_at.getTime() < 1000 * 3600 * 24;
          },
          "You can only leave comments on topics created today",
        ),
        ...
      ]
    });
  }
}
```

If you want to build your own custom validation predicate similar to `FieldIs`, make sure that it implements `AbstractIs` interface. Otherwise, you won't be able to use it in `validators` block.

Validators have so much in common with privacy rules that internally, the whole Ent Framework's privacy engine is called `Validation`.

The use case for validators is enforcing some early integrity checks on Ent fields before saving the Ent to the database. Putting this logic as close to the database layer as possible brings expra firmness to the architecture.

```typescript
try {
  const comment = EntComment.insertReturning(vc, {
    topic_id: topic.id,
    creator_id: vc.principal,
    message: request.body.message,
  });
  ...
} catch (e: unknown) {
  if (e instanceof EntValidationError) {
    return res.json({
      errors: e.errors.map((e) => ({
        field: e.field, // null if relates to the whole row
        message: e.message,
      })),
    });
  } else {
    throw e;
  }
}
```

## Whole-Row Validators

You can also define `RowIs` validators that operate with the entire row to be inserted or updated. As opposed to `FiledIs`, such validators are fired independently on which fields you are modifying.

```typescript
export class EntComment extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      privacyLoad: [...],
      privacyInsert: [...],
      validators: [
        new RowIs(
          async (row, vc) => checkForSpam(vc, row),
          "Comment spam checking failed",
        ),
        ...
      ]
    });
  }
}
```

## Using with Zod or Standard Schema

You can also use [Zod](https://zod.dev) or any validation library compatibe with [Standard Schema](https://standardschema.dev):

```typescript
import { z } from "zod";

validators: [
  // Use Zod's default generated message
  new FieldIs(
    "message",
    async (value) => z.string().min(10).safeParseAsync(value),
  ),
  // Custom error message.
  new FieldIs(
    "message",
    (value) => z.string()
      .min(10, "Text must be longer than 10 characters")
      .safeParse(value),
  ),
  // Validation of the entire row.
  new RowIs(
    (row) => z.object({
      title: z.string().min(1),
      message: z.string().min(10),
    }).safeParse(row),
  ),
  ...
]
```

Basically, when you omit the last `message` parameter of `FieldIs` or `RowIs` constructors, then it's expected that your validator callback returns an object compatible with Zod's [safeParse()](https://zod.dev/?id=safeparse) or Standard Schema's [validate()](https://standardschema.dev) result shape.
