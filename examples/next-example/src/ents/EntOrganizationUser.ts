import { PgSchema } from "ent-framework/pg";
import {
  ID,
  BaseEnt,
  AllowIf,
  CanReadOutgoingEdge,
  GLOBAL_SHARD,
} from "ent-framework";
import { cluster } from "./cluster";
import { EntUser } from "./EntUser";

const schema = new PgSchema(
  "organization_users",
  {
    id: { type: ID, autoInsert: "nextval('organization_users_id_seq')" },
    organization_id: { type: ID },
    user_id: { type: ID },
  },
  ["organization_id", "user_id"]
);

export class EntOrganizationUser extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: async (_vc, row) => row.user_id,
      privacyLoad: [new AllowIf(new CanReadOutgoingEdge("user_id", EntUser))],
      privacyInsert: [],
    });
  }
}
