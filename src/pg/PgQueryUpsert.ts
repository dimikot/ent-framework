import mapValues from "lodash/mapValues";
import omit from "lodash/omit";
import pick from "lodash/pick";
import pickBy from "lodash/pickBy";
import union from "lodash/union";
import type { Query } from "../abstract/Query";
import type { QueryAnnotation } from "../abstract/QueryAnnotation";
import type { Schema } from "../abstract/Schema";
import { indent, nullthrows } from "../internal/misc";
import type { Field, InsertInput, Table } from "../types";
import { ID } from "../types";
import type { PgClient } from "./PgClient";
import { PgRunner } from "./PgRunner";

export class PgQueryUpsert<TTable extends Table> implements Query<string> {
  readonly IS_WRITE = true;

  constructor(
    public readonly schema: Schema<TTable>,
    public readonly input: InsertInput<TTable>,
  ) {}

  async run(client: PgClient, annotation: QueryAnnotation): Promise<string> {
    if (!this.schema.uniqueKey.length) {
      throw Error(
        `Define unique key fields to use upsert for ${this.schema.name}`,
      );
    }

    const fieldsWithExplicitValues = Object.keys(this.schema.table).filter(
      (field) => this.input[field as keyof typeof this.input] !== undefined,
    );
    return client
      .batcher(
        this.constructor,
        this.schema,
        fieldsWithExplicitValues.join(":"),
        false,
        () =>
          new PgRunnerUpsert<TTable>(
            this.schema,
            client,
            fieldsWithExplicitValues,
          ),
      )
      .run(this.input, annotation);
  }
}

class PgRunnerUpsert<TTable extends Table> extends PgRunner<
  TTable,
  InsertInput<TTable>,
  string
> {
  static override readonly IS_WRITE = true;
  private builder;

  readonly op = "UPSERT";
  readonly maxBatchSize = 100;
  readonly default = "never_happens"; // abstract property implementation

  constructor(
    schema: Schema<TTable>,
    client: PgClient,
    fieldsWithExplicitValues: Array<Field<TTable>>,
  ) {
    super(schema, client);

    const table = this.schema.table;
    const uniqueKey = this.schema.uniqueKey as string[];
    const allFields = this.addPK(Object.keys(table), "prepend");

    // We must have at least some fields in the WITH CTE, because otherwise we
    // won't be able to generate FROM rows WHERE ... clause for the top UPDATE.
    fieldsWithExplicitValues = union(fieldsWithExplicitValues, uniqueKey);

    const insertSelectClause = {
      fields: allFields,
      autos: mapValues(
        omit(pick(table, allFields), fieldsWithExplicitValues),
        ({ autoInsert, autoUpdate }) => autoInsert ?? autoUpdate,
      ),
    };

    const updateWhereClause = {
      fields: uniqueKey,
      autos: mapValues(
        omit(pick(table, uniqueKey), fieldsWithExplicitValues),
        ({ autoInsert, autoUpdate }) => autoInsert ?? autoUpdate,
      ),
    };

    const updateFields = union(
      fieldsWithExplicitValues,
      Object.keys(pickBy(table, ({ autoUpdate }) => autoUpdate !== undefined)),
    );
    const updateSetClause = {
      fields: updateFields,
      autos: mapValues(
        omit(pick(table, updateFields), fieldsWithExplicitValues),
        ({ autoUpdate }) => autoUpdate,
      ),
    };

    this.builder = this.createWithBuilder({
      fields: fieldsWithExplicitValues,
      skipSorting: true, // THE ORDER MATTERS!!! See FRAGILE comment below.
      suffix:
        ",\nupdates AS (\n" +
        indent(
          this.fmt("UPDATE %T ") +
            this.fmt("SET %UPDATE_FIELD_VALUE_PAIRS(rows)\n", updateSetClause) +
            this.fmt(
              "FROM rows WHERE %WHERE_FIELD_VALUE_PAIRS(%T,rows)\n",
              updateWhereClause,
            ) +
            this.fmt(`RETURNING rows._key, %PK(%T) AS ${ID})`),
        ) +
        ",\ninserts AS (\n" +
        indent(
          this.fmt("INSERT INTO %T (%FIELDS)\n", { fields: allFields }) +
            this.fmt("SELECT %FIELDS\n", insertSelectClause) +
            "FROM rows WHERE _key NOT IN (SELECT _key FROM updates) OFFSET 1\n" +
            this.fmt("ON CONFLICT (%FIELDS) DO UPDATE ", {
              fields: uniqueKey,
            }) +
            this.fmt(
              "SET %UPDATE_FIELD_VALUE_PAIRS(EXCLUDED)\n",
              updateSetClause,
            ) +
            this.fmt(`RETURNING NULL AS _key, %PK AS ${ID})`),
        ) +
        `\nSELECT _key, ${ID} FROM updates UNION ALL SELECT _key, ${ID} FROM inserts`,
    });
  }

  override key(inputIn: InsertInput<TTable>): string {
    const input: Partial<Record<string, unknown>> = inputIn;
    const key: unknown[] = [];
    for (const field of this.schema.uniqueKey) {
      key.push(
        input[field] === null || input[field] === undefined
          ? { guaranteed_unique_value: super.key(inputIn) }
          : input[field],
      );
    }

    return JSON.stringify(key);
  }

  async runSingle(
    input: InsertInput<TTable>,
    annotations: QueryAnnotation[],
  ): Promise<string | undefined> {
    const sql =
      this.builder.prefix +
      this.builder.func([["", input]]) +
      this.builder.suffix;
    const rows = await this.clientQuery<{ _key: string; [ID]: string }>(
      sql,
      annotations,
      1,
    );
    return nullthrows(rows[0], sql)[ID];
  }

  async runBatch(
    inputs: Map<string, InsertInput<TTable>>,
    annotations: QueryAnnotation[],
  ): Promise<Map<string, string>> {
    const sql =
      this.builder.prefix + this.builder.func(inputs) + this.builder.suffix;

    const rows = await this.clientQuery<{ _key: string; [ID]: string }>(
      sql,
      annotations,
      inputs.size,
    );

    if (rows.length !== inputs.size) {
      throw Error(
        `BUG: number of rows returned from upsert (${rows.length}) ` +
          `is different from the number of input rows (${inputs.size}): ${sql}`,
      );
    }

    const outputs = new Map<string, string>();

    // First, extract all top-level UPDATEd rows, we know their keys.
    const inputsWithNullRowKeys = new Map(inputs);
    const rowsWithNullKey = [];
    for (const row of rows) {
      if (row._key !== null) {
        outputs.set(row._key, row[ID]);
        inputsWithNullRowKeys.delete(row._key);
      } else {
        rowsWithNullKey.push(row);
      }
    }

    // FRAGILE! Then, extract INSERTed or on-conflict UPDATEd rows, we don't
    // know their keys. In case insert didn't happen in "INSERT ... ON CONFLICT
    // DO UPDATE ... RETURNING ..." clause, we can't match the updated row id
    // with the key: one can only pull the fields of the updated table in
    // RETURNING, where _key field just doesn't exist. Luckily, the order of
    // rows returned is the same as the input rows order, and "ON CONFLICT DO
    // UPDATE" update always succeeds entirely (or fails entirely).
    let i = 0;
    for (const key of inputsWithNullRowKeys.keys()) {
      outputs.set(key, rowsWithNullKey[i][ID]);
      i++;
    }

    return outputs;
  }
}
