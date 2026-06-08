[**ent-framework**](../README.md)

***

[ent-framework](../globals.md) / PgTimelineStorage

# Class: PgTimelineStorage

Defined in: [src/pg/PgTimelineStorage.ts:46](https://github.com/clickup/ent-framework/blob/master/src/pg/PgTimelineStorage.ts#L46)

An append-only (with compaction) timeline storage for PG. The timelines are
always appended to the table, but from time to time, when the number of
chunks per principal exceeds the limit, the timelines are read back,
compacted and written back as a single row. This is race condition safe,
since timelines merging is an associative and idempotent operation, i.e.
(T1+T2)+T3 == T1+(T2+T3); in the worst case, we'll just have slightly
suboptimal timeline rows.

The expected table schema is:
```
CREATE UNLOGGED TABLE timelines(
  id bigserial PRIMARY KEY,
  principal text NOT NULL,
  data text NOT NULL,
  created_at timestamptz NOT NULL
);
CREATE INDEX timelines_principal ON timelines (principal);
```

Notes:
1. Index on `principal` must be non-unique, since there may be multiple
   records with the same value.
2. The `id` field should have sequential auto-increment, since it's used for
   garbage collection.
3. The table must exist in all microshards (including global shard).

## Extends

- [`TimelineStorage`](TimelineStorage.md)

## Constructors

### new PgTimelineStorage()

> **new PgTimelineStorage**(`options`): [`PgTimelineStorage`](PgTimelineStorage.md)

Defined in: [src/pg/PgTimelineStorage.ts:62](https://github.com/clickup/ent-framework/blob/master/src/pg/PgTimelineStorage.ts#L62)

Initializes an instance of PgTimelineStorage.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`PgTimelineStorageOptions`](../interfaces/PgTimelineStorageOptions.md) |

#### Returns

[`PgTimelineStorage`](PgTimelineStorage.md)

#### Overrides

[`TimelineStorage`](TimelineStorage.md).[`constructor`](TimelineStorage.md#constructors)

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="default_options"></a> `DEFAULT_OPTIONS` | `Required`\<`PickPartial`\<[`PgTimelineStorageOptions`](../interfaces/PgTimelineStorageOptions.md)\>\> | Default values for the constructor options. |
| <a id="options-1"></a> `options` | `Required`\<[`PgTimelineStorageOptions`](../interfaces/PgTimelineStorageOptions.md)\> | PgTimelineStorage configuration options. |

## Methods

### load()

> **load**(`principal`): `Promise`\<`string`[]\>

Defined in: [src/pg/PgTimelineStorage.ts:72](https://github.com/clickup/ent-framework/blob/master/src/pg/PgTimelineStorage.ts#L72)

Loads the timelines from the storage for a given principal.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `principal` | `string` |

#### Returns

`Promise`\<`string`[]\>

#### Overrides

[`TimelineStorage`](TimelineStorage.md).[`load`](TimelineStorage.md#load)

***

### save()

> **save**(`principal`, `dataStr`): `Promise`\<`void`\>

Defined in: [src/pg/PgTimelineStorage.ts:81](https://github.com/clickup/ent-framework/blob/master/src/pg/PgTimelineStorage.ts#L81)

Saves the timelines in the storage for a given principal.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `principal` | `string` |
| `dataStr` | `string` |

#### Returns

`Promise`\<`void`\>

#### Overrides

[`TimelineStorage`](TimelineStorage.md).[`save`](TimelineStorage.md#save)
