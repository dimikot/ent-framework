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
      shardAffinity: ["topic_id"],
      privacyInferPrincipal: async (_vc, row) => row.creator_id,
      privacyLoad: [
        new AllowIf(new CanReadOutgoingEdge("topic_id", EntTopic)),
        new AllowIf(new OutgoingEdgePointsToVC("creator_id")),
      ],
      privacyInsert: [new Require(new OutgoingEdgePointsToVC("creator_id"))],
    });
  }
}
