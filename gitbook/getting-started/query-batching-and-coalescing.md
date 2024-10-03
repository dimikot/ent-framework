# Query Batching and Coalescing

The following code will produce only one SQL `SELECT ... WHERE id IN(...)` query:

```typescript
await Promise.all([
  EntTopic.loadX(vc, "123"),
  EntTopic.loadX(vc, "456"),
  EntTopic.loadX(vc, "789"),
]);
```

The following code will produce 2 SQL queries: one `INSERT` and one `SELECT ... WHERE id IN(...)`.

```typescript
await Promise.all([
  EntTopic.insertReturning(vc, { ... }),
  EntTopic.insertReturning(vc, { ... }),
  EntTopic.insertReturning(vc, { ... }),
]);
```

The following code will produce 2 SQL queries: one `SELECT ... WHERE id IN(...)` to load comments and one more `SELECT ... WHERE id IN(...)` to load all corresponding topics of that comment.

```typescript
class EntComment extends BaseEnt(...) {
  ...
  async topic() {
    return EntTopic.loadX(this.vc, this.topic_id);
  }
}

const comments = await Promise.all([
  EntTopic.loadX(vc, "123"),
  EntTopic.loadX(vc, "456"),
]);
const topics = await Promise.all(comments.map((c) => c.topic()));
```

