import defaults from "lodash/defaults";
import first from "lodash/first";
import sortBy from "lodash/sortBy";
import type { Cluster } from "../abstract/Cluster";
import { MASTER } from "../abstract/Shard";
import { ShardError } from "../abstract/ShardError";
import type { TimelineStorageOptions } from "../ent/TimelineStorage";
import { TimelineStorage } from "../ent/TimelineStorage";
import { maybeCall, type PickPartial } from "../internal/misc";
import type { Literal } from "../types";
import { escapeIdent } from "./helpers/escapeIdent";
import type { PgClient } from "./PgClient";

export interface PgTimelineStorageOptions extends TimelineStorageOptions {
  cluster: Cluster<PgClient>;
  table?: string;
}

/**
 * An append-only (with compaction) timeline storage for PG. The timelines are
 * always appended to the table, but from time to time, when the number of
 * chunks per principal exceeds the limit, the timelines are read back,
 * compacted and written back as a single row. This is race condition safe,
 * since timelines merging is an associative and idempotent operation, i.e.
 * (T1+T2)+T3 == T1+(T2+T3); in the worst case, we'll just have slightly
 * suboptimal timeline rows.
 *
 * The expected table schema is:
 * ```
 * CREATE UNLOGGED TABLE timelines(
 *   id bigserial PRIMARY KEY,
 *   principal text NOT NULL,
 *   data text NOT NULL,
 *   created_at timestamptz NOT NULL
 * );
 * CREATE INDEX timelines_principal ON timelines (principal);
 * ```
 *
 * Notes:
 * 1. Index on `principal` must be non-unique, since there may be multiple
 *    records with the same value.
 * 2. The `id` field should have sequential auto-increment, since it's used for
 *    garbage collection.
 * 3. The table must exist in all microshards (including global shard).
 */
export class PgTimelineStorage extends TimelineStorage {
  /** Default values for the constructor options. */
  static override readonly DEFAULT_OPTIONS: Required<
    PickPartial<PgTimelineStorageOptions>
  > = {
    ...super.DEFAULT_OPTIONS,
    table: "timelines",
    maxChunksPerPrincipal: 10,
  };

  /** PgTimelineStorage configuration options. */
  override readonly options: Required<PgTimelineStorageOptions>;

  /**
   * Initializes an instance of PgTimelineStorage.
   */
  constructor(options: PgTimelineStorageOptions) {
    super(options);
    this.options = defaults(
      {},
      options,
      (this as TimelineStorage).options,
      PgTimelineStorage.DEFAULT_OPTIONS,
    );
  }

  async load(principal: string): Promise<string[]> {
    const rows = await this.query<{ id: string | number; data: string }>(
      principal,
      "TIMELINES_SELECT",
      ["SELECT data FROM %T WHERE principal=?", principal],
    );
    return sortBy(rows, (row) => row.id).map((row) => row.data);
  }

  async save(principal: string, dataStr: string): Promise<void> {
    const row = first(
      await this.query<{ id: string | number; chunks: string[] | null }>(
        principal,
        "TIMELINES_INSERT",
        [
          "INSERT INTO %T (principal, data, created_at) VALUES (?, ?, now())\n" +
            "RETURNING id, (SELECT array_agg(id||':'||data) FROM %T WHERE principal=?) AS chunks",
          principal,
          dataStr,
          principal,
        ],
      ),
    )!;
    if (
      !row.chunks ||
      row.chunks.length <= maybeCall(this.options.maxChunksPerPrincipal) - 1
    ) {
      return;
    }

    let dataStrs = [[String(row.id), dataStr]];
    for (const chunk of row.chunks) {
      const pos = chunk.indexOf(":");
      dataStrs.push([chunk.substring(0, pos), chunk.substring(pos + 1)]);
    }

    dataStrs = sortBy(dataStrs, ([id, _]) => id);
    dataStr = this.options.merge(dataStrs.map(([_, data]) => data));

    await this.query(principal, "TIMELINES_INSERT", [
      "INSERT INTO %T (principal, data, created_at) VALUES (?, ?, now())",
      principal,
      dataStr,
    ]);
    await this.query(principal, "TIMELINES_DELETE", [
      "DELETE FROM %T WHERE id=ANY(?)",
      dataStrs.map(([id]) => id),
    ]);
  }

  private async query<TRow>(
    principal: string,
    op: string,
    query: Literal,
  ): Promise<TRow[]> {
    let shard;
    try {
      shard = this.options.cluster.shard(principal);
    } catch (e) {
      if (e instanceof ShardError) {
        shard = this.options.cluster.globalShard();
      } else {
        throw e;
      }
    }

    const client = await shard.client(MASTER);
    return client.query<TRow>({
      query: [
        String(query[0]).replace(/%T/g, escapeIdent(this.options.table)),
        ...query.slice(1),
      ],
      isWrite: true,
      annotations: [],
      op,
      table: this.options.table,
    });
  }
}
