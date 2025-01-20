import { PgSchema } from "ent-framework/pg";
import {
  ID,
  BaseEnt,
  AllowIf,
  GLOBAL_SHARD,
  IncomingEdgeFromVCExists,
} from "ent-framework";
import { cluster } from "./cluster";
import { EntOrganizationUser } from "./EntOrganizationUser";

const schema = new PgSchema(
  "organizations",
  {
    id: { type: ID, autoInsert: "nextval('organizations_id_seq')" },
    name: { type: String },
  },
  []
);

export class EntOrganization extends BaseEnt(cluster, schema) {
  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: null,
      privacyLoad: [
        new AllowIf(
          new IncomingEdgeFromVCExists(
            EntOrganizationUser,
            "user_id",
            "organization_id"
          )
        ),
      ],
      privacyInsert: [],
    });
  }
}
