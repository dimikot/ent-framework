[**ent-framework**](../README.md)

***

[ent-framework](../globals.md) / PgQueryUpsert

# Class: PgQueryUpsert\<TTable\>

Defined in: [src/pg/PgQueryUpsert.ts:15](https://github.com/clickup/ent-framework/blob/master/src/pg/PgQueryUpsert.ts#L15)

A very lean interface for a Query. In practice each query is so different
that this interface is the only common part of them all.

## Type Parameters

| Type Parameter |
| ------ |
| `TTable` *extends* [`Table`](../type-aliases/Table.md) |

## Implements

- [`Query`](../interfaces/Query.md)\<`string`\>

## Constructors

### new PgQueryUpsert()

> **new PgQueryUpsert**\<`TTable`\>(`schema`, `input`): [`PgQueryUpsert`](PgQueryUpsert.md)\<`TTable`\>

Defined in: [src/pg/PgQueryUpsert.ts:18](https://github.com/clickup/ent-framework/blob/master/src/pg/PgQueryUpsert.ts#L18)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `schema` | [`Schema`](Schema.md)\<`TTable`, [`UniqueKey`](../type-aliases/UniqueKey.md)\<`TTable`\>\> |
| `input` | [`InsertInput`](../type-aliases/InsertInput.md)\<`TTable`\> |

#### Returns

[`PgQueryUpsert`](PgQueryUpsert.md)\<`TTable`\>

## Properties

| Property | Type | Default value |
| ------ | ------ | ------ |
| <a id="is_write"></a> `IS_WRITE` | `true` | `true` |
| <a id="schema-1"></a> `schema` | [`Schema`](Schema.md)\<`TTable`, [`UniqueKey`](../type-aliases/UniqueKey.md)\<`TTable`\>\> | `undefined` |
| <a id="input-1"></a> `input` | [`InsertInput`](../type-aliases/InsertInput.md)\<`TTable`\> | `undefined` |

## Methods

### run()

> **run**(`client`, `annotation`): `Promise`\<`string`\>

Defined in: [src/pg/PgQueryUpsert.ts:23](https://github.com/clickup/ent-framework/blob/master/src/pg/PgQueryUpsert.ts#L23)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `client` | [`PgClient`](PgClient.md)\<`Pool`\> |
| `annotation` | [`QueryAnnotation`](../interfaces/QueryAnnotation.md) |

#### Returns

`Promise`\<`string`\>

#### Implementation of

[`Query`](../interfaces/Query.md).[`run`](../interfaces/Query.md#run)
