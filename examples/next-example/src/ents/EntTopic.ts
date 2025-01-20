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
