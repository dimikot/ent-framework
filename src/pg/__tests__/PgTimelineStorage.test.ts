import { GLOBAL_SHARD } from "../../ent/ShardAffinity";
import { PgTimelineStorage } from "../PgTimelineStorage";
import { recreateTestTables, testCluster } from "./test-utils";

let storage: PgTimelineStorage;

beforeEach(async () => {
  const ddl = {
    CREATE: [
      `CREATE UNLOGGED TABLE %T(
        id bigserial PRIMARY KEY,
        principal text NOT NULL,
        data text NOT NULL,
        created_at timestamptz NOT NULL
      )`,
      "CREATE INDEX ON %T (principal)",
    ],
    SCHEMA: { name: 'pg-timeline-storage.timelines"table' },
  };
  await recreateTestTables([
    { ...ddl, SHARD_AFFINITY: [] },
    { ...ddl, SHARD_AFFINITY: GLOBAL_SHARD },
  ]);

  storage = new PgTimelineStorage({
    cluster: testCluster,
    table: ddl.SCHEMA.name,
    merge: (dataStrs) => dataStrs.join(";"),
    maxChunksPerPrincipal: 3,
  });
});

test("load and save in a microshard", async () => {
  const PRINCIPAL = "100020000042";

  expect(await storage.load(PRINCIPAL)).toEqual([]);

  await storage.save(PRINCIPAL, "chunk1");
  expect(await storage.load(PRINCIPAL)).toEqual(["chunk1"]);

  await storage.save(PRINCIPAL, "chunk2");
  await storage.save(PRINCIPAL, "chunk3");
  expect(await storage.load(PRINCIPAL)).toEqual(["chunk1", "chunk2", "chunk3"]);

  await storage.save(PRINCIPAL, "chunk4");
  expect(await storage.load(PRINCIPAL)).toEqual([
    "chunk1;chunk2;chunk3;chunk4",
  ]);

  await storage.save(PRINCIPAL, "chunk5");
  expect(await storage.load(PRINCIPAL)).toEqual([
    "chunk1;chunk2;chunk3;chunk4",
    "chunk5",
  ]);
});

test("load and save in global shard", async () => {
  const PRINCIPAL = "some";
  await storage.save(PRINCIPAL, "chunk1");
  expect(await storage.load(PRINCIPAL)).toEqual(["chunk1"]);
});
