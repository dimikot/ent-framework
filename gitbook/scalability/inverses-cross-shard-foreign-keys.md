# Inverses, Cross Shard Foreign Keys

We already touched the topic of inverses and loading Ents across multiple microshards in [ent-api-select-by-expression.md](../getting-started/ent-api-select-by-expression.md "mention") article. We also noted that in many cases, it's better to colocate "related" Ents in one microshard: [shard-affinity-ent-colocation.md](shard-affinity-ent-colocation.md "mention").

Now, it's time to discuss how inverses work in details.

## Ents with Random Shard Affinity

Let's first build a pretty artificial "family" of the Ents (EntUser—EntTopic—EntComment), where each Ent is created in a random shard at insert time. (In real life, you'll likely want most of your Ents to be colocated to their parents, but for the best illustration,  we'll make the opposite assumption).

```typescript
export class EntUser extends BaseEnt(
  cluster, 
  new PgSchema("users", {
    id: { type: ID, autoInsert: "id_gen()" },
    ...
  }),
) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: [],
      ...
    });
  }
}

export class EntTopic extends BaseEnt(
  cluster, 
  new PgSchema("topics", {
    id: { type: ID, autoInsert: "id_gen()" },
    // Reference to parent 1.
    creator_id: { type: ID },
    // Reference to parent 2 (optional).
    last_commenter_id: { type: ID, allowNull: true },
    ...
  }),
) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: [],
      inverses: {
        creator_id: { name: "inverses", type: "topic2creators" },
        last_commenter_id: { name: "inverses", type: "topic2last_commenters" },
      },
      ...
    });
  }
}

export class EntComment extends BaseEnt(
  cluster, 
  new PgSchema("comments", {
    id: { type: ID, autoInsert: "id_gen()" },
    // Reference to parent.
    topic_id: { type: ID },
    ...
  }),
) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: [],
      inverses: {
        topic_id: { name: "inverses", type: "comment2topics" },
      },
      ...
    });
  }
}

const userID = await EntUser.insert(vc, { ... });
const topicID = await EntTopic.insert(vc, {
  creator_id: userID,
  last_commenter_id: null,
  ...
});
const commentID = await EntComment.insert(vc, {
  topic_id: topicID,
  ...
});
```

Notice the following:

1. `shardAffinity=[]` for all of the above Ents. It means that, at insert time, the target microshard will be chosen randomly.
2. There is `inverses` configuration property, which tells Ent Framework, how it can find children Ents located in other microshards than the parent Ents (e.g. how to find all topics related to a particular creator).

## SQL Tables for Inverses

Before we continue, let's look at the tables structure we need to have in **all microshards** of the database.

```sql
-- All of sh0001, sh0002 etc. schemas must have this:
CREATE TABLE users(
  id bigint PRIMARY KEY DEFAULT id_gen(),
  ...
);

CREATE TABLE topics(
  id bigint PRIMARY KEY DEFAULT id_gen(),
  creator_id bigint NOT NULL,
  last_commenter_id bigint,
  ...
);
CREATE INDEX topics_creator_id ON topics(creator_id);
CREATE INDEX topics_last_commenter_id ON topics(last_commenter_id);

CREATE TABLE comments(
  id bigint PRIMARY KEY DEFAULT id_gen(),
  topic_id bigint,
  ...
);
CREATE INDEX comments_topic_id ON comments(topic_id);

-- And the main table for this article...
CREATE TABLE inverses(
  id bigint PRIMARY KEY DEFAULT id_gen(),
  created_at timestamptz NOT NULL DEFAULT now(),
  type varchar(64) NOT NULL,
  id1 bigint,
  id2 bigint,
  UNIQUE(type, id1, id2)
);
```

Tables `users`, `topics` and `comments` are not much special, except that their `*_id` fields are not declared as `FOREIGN KEY`. No surprise: there can be no SQL-enforced foreign keys across microshards, so we just keep the fields being of the regular `bigint` type. We still define indexes for those fields though, for faster selection.

Now, notice the `inverses` table. It is treated by Ent Framework in a special way.







