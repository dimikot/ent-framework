# Validators

Validators are predicates, similar to what you use in  `privacyInsert/Update` rules. They are called all at the same time, and the error messages (if any) are accumulated to build and throw a compound `EntValidationError` instance.

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

If you want to build your own custom validation predicate, make sure that it implements `EntValidationErrorInfo` interface. Otherwise, you won't be able to use it in `validators` block.

Validators have so much in common with privacy rules that internally, the whole Ent Framework's privacy engine is called `Validation`.

The use case for validators is enforcing some early integrity checks on Ent fields before saving the Ent to the database:

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
        field: e.field,
        message: e.message,
      })),
    });
  } else {
    throw e;
  }
}
```
