# Create Ent Classes

Once you have a Cluster instance, you can create Ent classes to access the data.

{% code title="ents/EntUser.ts" %}
```typescript
import { PgSchema } from "ent-framework/pg";
import { ID, BaseEnt, GLOBAL_SHARD, AllowIf, OutgoingEdgePointsToVC } from "ent-framework";
import { cluster } from "./cluster";

const schema = new PgSchema(
  "users",
  {
    id: { type: ID, autoInsert: "nextval('users_id_seq')" },
    email: { type: String },
    is_admin: { type: Boolean, autoInsert: "false" },
  },
  ["email"]
);

export class EntUser extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: async (_vc, row) => row.id,
      privacyLoad: [new AllowIf(new OutgoingEdgePointsToVC("id"))],
      privacyInsert: [],
    });
  }
}
```
{% endcode %}

If your app uses UUID type for ID fields, just replace `nextval('users_id_seq')` with something like:

```typescript
autoInsert: "gen_random_uuid()"
```

(Read more about ID formats and microsharding aspects in [locating-a-shard-id-format.md](../scalability/locating-a-shard-id-format.md "mention") article.)

Each Ent may also have one optional "unique key" (possible composite) which is treated by the engine in a specific optimized way. In the above example, it's `email`.

{% code title="ents/EntTopic.ts" %}
```typescript
import { PgSchema } from "ent-framework/pg";
import {
  ID,
  BaseEnt,
  GLOBAL_SHARD,
  AllowIf,
  OutgoingEdgePointsToVC,
  Require,
} from "ent-framework";
import { cluster } from "./cluster";

const schema = new PgSchema(
  "topics",
  {
    id: { type: ID, autoInsert: "nextval('topics_id_seq')" },
    created_at: { type: Date, autoInsert: "now()" },
    updated_at: { type: Date, autoUpdate: "now()" },
    slug: { type: String },
    creator_id: { type: ID },
    subject: { type: String, allowNull: true },
  },
  ["slug"]
);

export class EntTopic extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: async (_vc, row) => row.creator_id,
      privacyLoad: [new AllowIf(new OutgoingEdgePointsToVC("creator_id"))],
      privacyInsert: [new Require(new OutgoingEdgePointsToVC("creator_id"))],
    });
  }
}
```
{% endcode %}

By default, all fields are non-nullable (unless you provide `allowNull` option).

Disregard privacy rules for now, it's a more complicated topic which will be covered later. For now, the code should be obvious enough.

{% code title="ents/EntComment.ts" %}
```typescript
import { PgSchema } from "ent-framework/pg";
import {
  ID,
  BaseEnt,
  AllowIf,
  CanReadOutgoingEdge,
  OutgoingEdgePointsToVC,
  Require,
} from "ent-framework";
import { cluster } from "./cluster";
import { EntTopic } from "./EntTopic";

const schema = new PgSchema(
  "comments",
  {
    id: { type: ID, autoInsert: "nextval('comments_id_seq')" },
    created_at: { type: Date, autoInsert: "now()" },
    topic_id: { type: ID },
    creator_id: { type: ID },
    message: { type: String },
  },
  []
);

export class EntComment extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: async (_vc, row) => row.creator_id,
      privacyLoad: [
        new AllowIf(new CanReadOutgoingEdge("topic_id", EntTopic)),
        new AllowIf(new OutgoingEdgePointsToVC("creator_id")),
      ],
      privacyInsert: [new Require(new OutgoingEdgePointsToVC("creator_id"))],
    });
  }
}
```
{% endcode %}

Since we have no microshards yet, `shardAffinity` basically does nothing. We'll talk about microsharding in [locating-a-shard-id-format.md](../scalability/locating-a-shard-id-format.md "mention").
