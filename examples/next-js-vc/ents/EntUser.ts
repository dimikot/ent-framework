import { PgSchema } from "ent-framework/pg";
import {
  ID,
  BaseEnt,
  GLOBAL_SHARD,
  AllowIf,
  OutgoingEdgePointsToVC,
} from "ent-framework";
import { cluster } from "./cluster";

const schema = new PgSchema(
  "users",
  {
    id: { type: ID, autoInsert: "nextval('users_id_seq')" },
    email: { type: String },
    is_admin: { type: Boolean },
  },
  ["email"]
);

export class EntUser extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: async (_vc, row) => row.id,
      privacyLoad: [
        new AllowIf(new OutgoingEdgePointsToVC("id")),
        new AllowIf(async (vc) => {
          const vcUser = await EntUser.loadX(vc, vc.principal);
          return !!vcUser.is_admin;
        }),
      ],
      privacyInsert: [],
    });
  }
}
