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

When you e.g. insert an EntTopic row, Ent Framework first chooses the target microshard randomly and then creates a row in `inverses` table in the parent's shard. It then inserts the row to the destination microshard. Thus, Ent Framework remembers, what are the children microshards (encoded in `inverses.id2`) for each parent ID (`inverses.id1`).

## An Example of What's Actually Inserted

Probably the simplest way to understand inverses is to look at a particular example, what's inserted and where when creating the Ents.

Consider the following "family" Ents creation.

```typescript
//
// Remember that we had the following inverses defined for EntTopic:
//   inverses: {
//     creator_id: { name: "inverses", type: "topic2creators" },
//     last_commenter_id: { name: "inverses", type: "topic2last_commenters" },
//   },
//
// And for EntComment:
//   inverses: {
//     topic_id: { name: "inverses", type: "comment2topics" },
//   },
//
const creatorID = await EntUser.insert(vc, { ... });
const commenterID = await EntUser.insert(vc, { ... });
const topicID = await EntTopic.insert(vc, {
  creator_id: creatorID,
  last_commenter_id: commenterID,
  ...
});
const commentID = await EntComment.insert(vc, {
  topic_id: topicID,
  ...
});
```

Internally, Ent Framework will run the following SQL queries (pseudo-code):

```sql
-- Microshard for the user is randomly chosen as sh0888.
INSERT INTO sh0888.users(id) VALUES(id_gen())
  RETURNING id INTO $creatorID;

-- Microshard for anotjer user is randomly chosen as sh0999.
INSERT INTO sh0999.users(id) VALUES(id_gen())
  RETURNING id INTO $commenterID;

-- Microshard for the topic is randomly chosen as sh0123.
$topicID := sh0123.id_gen();
INSERT INTO sh0888.inverses(type, id1, id2) VALUES
  ('topic2creators', $creatorID, $topicID);
INSERT INTO sh0999.inverses(type, id1, id2) VALUES
  ('topic2last_commenters', $commenterID, $topicID);
INSERT INTO sh0123.topics(id, creator_id, last_commenter_id) VALUES
  ($topicID, $creatorID, $commenterID);

-- Microshard for the comment is randomly chosen as sh0456.
$commentID := sh0456.id_gen();
INSERT INTO sh0123.inverses(type, id1, id2) VALUES
  ('comment2topics', $topicID, $commentID);
INSERT INTO sh0456.comments(id, topic_id) VALUES
  ($commentID, $topicID);
```

Notice that, because of `{ name: "inverses", type: "topic2creators" }` inverse specifier, Ent Framework knows that the inverses table name is `inverses`, and the value of the `type` field there is `"topic2creators"`. The You can choose your own values for both of those things: the above example is just a convention.

As a result, the following rows will appear in the database tables:

```
sh0888 - creator's shard:
- users(id:10888001)
- inverses(type:topic2creators  id1:10888001    id2:10123002)
                                    $creatorID      $topicID
sh0999 - commenter's shard:
- users(id:10999001)
- inverses(type:topic2last_commenters  id1:10999001      id2:10123002)
                                           $commenterID      $topicID
sh0123 - topic's shard:
- topics(id:10123002 creator_id:10888001 last_commenter_id:10999001)
- inverses(type:comment2topics  id1:10123002  id2:10456003)
                                    $topicID      $commentID
sh0456 - comment's shard:
- comments(id:10456003 topic_id:10123002)
```

















