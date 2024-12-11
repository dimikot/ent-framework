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

In fact, validators have so much in common with privacy rules that internally, the whole Ent Franework's privacy engine is called `Validation`.
