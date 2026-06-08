[**ent-framework**](../README.md)

***

[ent-framework](../globals.md) / QueryBase

# Class: `abstract` QueryBase\<TTable, TInput, TOutput, TClient\>

Defined in: [src/abstract/QueryBase.ts:15](https://github.com/clickup/ent-framework/blob/master/src/abstract/QueryBase.ts#L15)

A convenient base class for most (but not all) of the queries, where the
Runner instance is the same for different query input shapes. If the query
doesn't fit the QueryBase framework (like PgQueryUpdate for instance where we
have separate Runner instances for separate set of updated fields), a Query
is used directly instead.

## Extended by

- [`PgQueryCount`](PgQueryCount.md)
- [`PgQueryDelete`](PgQueryDelete.md)
- [`PgQueryDeleteWhere`](PgQueryDeleteWhere.md)
- [`PgQueryExists`](PgQueryExists.md)
- [`PgQueryIDGen`](PgQueryIDGen.md)
- [`PgQueryInsert`](PgQueryInsert.md)
- [`PgQueryLoad`](PgQueryLoad.md)
- [`PgQueryLoadBy`](PgQueryLoadBy.md)
- [`PgQuerySelect`](PgQuerySelect.md)

## Type Parameters

| Type Parameter |
| ------ |
| `TTable` *extends* [`Table`](../type-aliases/Table.md) |
| `TInput` |
| `TOutput` |
| `TClient` *extends* [`Client`](Client.md) |

## Implements

- [`Query`](../interfaces/Query.md)\<`TOutput`\>

## Constructors

### new QueryBase()

> **new QueryBase**\<`TTable`, `TInput`, `TOutput`, `TClient`\>(`schema`, `input`): [`QueryBase`](QueryBase.md)\<`TTable`, `TInput`, `TOutput`, `TClient`\>

Defined in: [src/abstract/QueryBase.ts:27](https://github.com/clickup/ent-framework/blob/master/src/abstract/QueryBase.ts#L27)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `schema` | [`Schema`](Schema.md)\<`TTable`, [`UniqueKey`](../type-aliases/UniqueKey.md)\<`TTable`\>\> |
| `input` | `TInput` |

#### Returns

[`QueryBase`](QueryBase.md)\<`TTable`, `TInput`, `TOutput`, `TClient`\>

## Properties

| Property | Type |
| ------ | ------ |
| <a id="schema-1"></a> `schema` | [`Schema`](Schema.md)\<`TTable`, [`UniqueKey`](../type-aliases/UniqueKey.md)\<`TTable`\>\> |
| <a id="input-1"></a> `input` | `TInput` |

## Accessors

### IS\_WRITE

#### Get Signature

> **get** **IS\_WRITE**(): `boolean`

Defined in: [src/abstract/QueryBase.ts:32](https://github.com/clickup/ent-framework/blob/master/src/abstract/QueryBase.ts#L32)

##### Returns

`boolean`

#### Implementation of

[`Query`](../interfaces/Query.md).[`IS_WRITE`](../interfaces/Query.md#is_write)

## Methods

### run()

> **run**(`client`, `annotation`): `Promise`\<`TOutput`\>

Defined in: [src/abstract/QueryBase.ts:36](https://github.com/clickup/ent-framework/blob/master/src/abstract/QueryBase.ts#L36)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `client` | `TClient` |
| `annotation` | [`QueryAnnotation`](../interfaces/QueryAnnotation.md) |

#### Returns

`Promise`\<`TOutput`\>

#### Implementation of

[`Query`](../interfaces/Query.md).[`run`](../interfaces/Query.md#run)
