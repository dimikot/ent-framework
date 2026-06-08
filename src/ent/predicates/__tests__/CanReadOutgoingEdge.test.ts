import {
  recreateTestTables,
  testCluster,
} from "../../../pg/__tests__/test-utils";
import { PgSchema } from "../../../pg/PgSchema";
import { createVC } from "../../__tests__/test-utils";
import { BaseEnt } from "../../BaseEnt";
import { EntNotReadableError } from "../../errors/EntNotReadableError";
import { AllowIf } from "../../rules/AllowIf";
import { GLOBAL_SHARD } from "../../ShardAffinity";
import { CanReadOutgoingEdge } from "../CanReadOutgoingEdge";
import { OutgoingEdgePointsToVC } from "../OutgoingEdgePointsToVC";
import { True } from "../True";

/**
 * CanReadOutgoingEdge uses global ID cache to determine if an Ent is readable.
 * If the same ID exists for a different Ent with different privacy rules, then
 * VC could elevate access before fixing the bug.
 *
 * Setup:
 *  * TestUser
 *  * TestObject (only accessible to owners)
 *  * TestObjectShallow (accessible to anyone
 *  * TestObjectSecret (only accessible to TestObject owners)
 *
 * By reading TestObjectShallow first, the attacker could then read
 * TestObjectSecret. Now, they cannot, since IDsCache uses the Ent class
 * objectId() to prevent keys collision.
 */
class EntTestUser extends BaseEnt(
  testCluster,
  new PgSchema(
    'ent.can-read-outgoing-edge"user',
    {
      id: { type: String, autoInsert: "id_gen()" },
    },
    [],
  ),
) {
  static readonly CREATE = [
    `CREATE TABLE %T(
      id bigint NOT NULL PRIMARY KEY
    )`,
  ];

  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: async (_vc, row) => row.id,
      privacyLoad: [new AllowIf(new OutgoingEdgePointsToVC("id"))],
      privacyInsert: [],
    });
  }
}

class EntTestObject extends BaseEnt(
  testCluster,
  new PgSchema(
    'ent.can-read-outgoing-edge"object',
    {
      id: { type: String, autoInsert: "id_gen()" },
      owner_id: { type: String },
    },
    [],
  ),
) {
  static readonly CREATE = [
    `CREATE TABLE %T(
      id bigint NOT NULL PRIMARY KEY,
      owner_id bigint NOT NULL
    )`,
  ];

  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: null,
      privacyLoad: [
        new AllowIf(new CanReadOutgoingEdge("owner_id", EntTestUser)),
      ],
      privacyInsert: [],
    });
  }
}

class EntTestObjectShallow extends BaseEnt(
  testCluster,
  new PgSchema(
    'ent.can-read-outgoing-edge"object',
    {
      id: { type: String, autoInsert: "id_gen()" },
      owner_id: { type: String },
    },
    [],
  ),
) {
  static readonly CREATE = [];

  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: null,
      privacyLoad: [new AllowIf(new True())],
      privacyInsert: [], // Insert is not permitted
    });
  }
}

class EntTestObjectSecret extends BaseEnt(
  testCluster,
  new PgSchema(
    'ent.can-read-outgoing-edge"object_secret',
    {
      id: { type: String, autoInsert: "id_gen()" },
      object_id: { type: String },
      secret: { type: String },
    },
    [],
  ),
) {
  static readonly CREATE = [
    `CREATE TABLE %T(
      id bigint NOT NULL PRIMARY KEY,
      object_id bigint NOT NULL UNIQUE,
      secret text NOT NULL
    )`,
  ];

  static override configure() {
    return new this.Configuration({
      shardAffinity: GLOBAL_SHARD,
      privacyInferPrincipal: null,
      privacyLoad: [
        new AllowIf(new CanReadOutgoingEdge("object_id", EntTestObject)),
      ],
      privacyInsert: [],
    });
  }
}

beforeEach(async () => {
  await recreateTestTables([EntTestUser, EntTestObject, EntTestObjectSecret]);
});

test("Accessing the full ent fails", async () => {
  const vc = createVC();
  const owner = await EntTestUser.insertReturning(vc.toOmniDangerous(), {});
  const objectID = await EntTestObject.insert(vc.toOmniDangerous(), {
    owner_id: owner.id,
  });
  await EntTestObjectSecret.insert(vc.toOmniDangerous(), {
    object_id: objectID,
    secret: "swordfish",
  });

  const attacker = await EntTestUser.insertReturning(vc.toOmniDangerous(), {});
  await expect(
    EntTestObjectSecret.select(attacker.vc, { object_id: objectID }, 1),
  ).rejects.toThrow(EntNotReadableError);
});

test("Accessing the shallow ent first and then accessing the full ent fails", async () => {
  const vc = createVC();
  const owner = await EntTestUser.insertReturning(vc.toOmniDangerous(), {});
  const objectID = await EntTestObject.insert(vc.toOmniDangerous(), {
    owner_id: owner.id,
  });
  await EntTestObjectSecret.insert(vc.toOmniDangerous(), {
    object_id: objectID,
    secret: "swordfish",
  });

  const attacker = await EntTestUser.insertReturning(vc.toOmniDangerous(), {});
  await expect(
    EntTestObjectShallow.loadX(attacker.vc, objectID),
  ).resolves.toMatchObject({
    owner_id: owner.id,
  });
  await expect(
    EntTestObjectSecret.select(attacker.vc, { object_id: objectID }, 1),
  ).rejects.toThrow(EntNotReadableError);
});
