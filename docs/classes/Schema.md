[**ent-framework**](../README.md)

***

[ent-framework](../globals.md) / Schema

# Class: `abstract` Schema\<TTable, TUniqueKey\>

Defined in: [src/abstract/Schema.ts:37](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L37)

Schema is like a "table" in some database (sharded, but it's beyond the scope
of Schema). It is also a factory of Query: it knows how to build runnable
Query objects. This 2nd role is database engine specific (e.g. there might be
PgSchema, RedisSchema etc.): such composition simplifies the code and lowers
the number of abstractions.

The set of supported Queries is opinionated and is crafted carefully to
support the minimal possible list of primitives, but at the same time, be not
too limited in the queries the DB engine can execute.

## Extended by

- [`PgSchema`](PgSchema.md)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `TTable` *extends* [`Table`](../type-aliases/Table.md) | - |
| `TUniqueKey` *extends* [`UniqueKey`](../type-aliases/UniqueKey.md)\<`TTable`\> | [`UniqueKey`](../type-aliases/UniqueKey.md)\<`TTable`\> |

## Constructors

### new Schema()

> **new Schema**\<`TTable`, `TUniqueKey`\>(`name`, `table`, `uniqueKey`): [`Schema`](Schema.md)\<`TTable`, `TUniqueKey`\>

Defined in: [src/abstract/Schema.ts:116](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L116)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `name` | `string` | For relational databases, it's likely a table name. |
| `table` | `TTable` | Structure of the table. |
| `uniqueKey` | `TUniqueKey` | Fields which the native unique key consists of (if any). |

#### Returns

[`Schema`](Schema.md)\<`TTable`, `TUniqueKey`\>

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="constructor"></a> `constructor` | [`SchemaClass`](../interfaces/SchemaClass.md) | Used in e.g. inverses. This casts this.constructor to SchemaClass with all static methods and `new` semantic (TS doesn't do it by default; for TS, x.constructor is Function). |
| <a id="name-1"></a> `name` | `string` | For relational databases, it's likely a table name. |
| <a id="table-1"></a> `table` | `TTable` | Structure of the table. |
| <a id="uniquekey-1"></a> `uniqueKey` | `TUniqueKey` | Fields which the native unique key consists of (if any). |

## Methods

### idGen()

> `abstract` **idGen**(): [`Query`](../interfaces/Query.md)\<`string`\>

Defined in: [src/abstract/Schema.ts:54](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L54)

Generates a new ID for the row. Used when e.g. there is a beforeInsert
trigger on the Ent which needs to know the ID beforehand.

#### Returns

[`Query`](../interfaces/Query.md)\<`string`\>

***

### insert()

> `abstract` **insert**(`input`): [`Query`](../interfaces/Query.md)\<`null` \| `string`\>

Defined in: [src/abstract/Schema.ts:60](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L60)

Creates a new row. Returns null if the row violates some unique key
constraint, otherwise returns the row ID.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | [`InsertInput`](../type-aliases/InsertInput.md)\<`TTable`\> |

#### Returns

[`Query`](../interfaces/Query.md)\<`null` \| `string`\>

***

### upsert()

> `abstract` **upsert**(`input`): [`Query`](../interfaces/Query.md)\<`string`\>

Defined in: [src/abstract/Schema.ts:65](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L65)

Upserts a row. Always returns the row ID.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | [`InsertInput`](../type-aliases/InsertInput.md)\<`TTable`\> |

#### Returns

[`Query`](../interfaces/Query.md)\<`string`\>

***

### update()

> `abstract` **update**(`id`, `input`): [`Query`](../interfaces/Query.md)\<`boolean`\>

Defined in: [src/abstract/Schema.ts:70](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L70)

Updates one single row by its ID. Returns true if it actually existed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `input` | [`UpdateInput`](../type-aliases/UpdateInput.md)\<`TTable`\> |

#### Returns

[`Query`](../interfaces/Query.md)\<`boolean`\>

***

### delete()

> `abstract` **delete**(`id`): [`Query`](../interfaces/Query.md)\<`boolean`\>

Defined in: [src/abstract/Schema.ts:75](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L75)

Deletes a row by id. Returns true if it actually existed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`Query`](../interfaces/Query.md)\<`boolean`\>

***

### load()

> `abstract` **load**(`id`): [`Query`](../interfaces/Query.md)\<`null` \| [`Row`](../type-aliases/Row.md)\<`TTable`\>\>

Defined in: [src/abstract/Schema.ts:81](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L81)

"Load" family of methods means that we load exactly one row. This one
returns a row by its ID or null if it's not found.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`Query`](../interfaces/Query.md)\<`null` \| [`Row`](../type-aliases/Row.md)\<`TTable`\>\>

***

### loadBy()

> `abstract` **loadBy**(`input`): [`Query`](../interfaces/Query.md)\<`null` \| [`Row`](../type-aliases/Row.md)\<`TTable`\>\>

Defined in: [src/abstract/Schema.ts:87](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L87)

Loads one single row by its unique key ("by" denotes that it's based on an
unique key, not on an ID). Returns null if it's not found.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | [`LoadByInput`](../type-aliases/LoadByInput.md)\<`TTable`, `TUniqueKey`\> |

#### Returns

[`Query`](../interfaces/Query.md)\<`null` \| [`Row`](../type-aliases/Row.md)\<`TTable`\>\>

***

### selectBy()

> `abstract` **selectBy**(`input`): [`Query`](../interfaces/Query.md)\<[`Row`](../type-aliases/Row.md)\<`TTable`\>[]\>

Defined in: [src/abstract/Schema.ts:96](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L96)

"Select" family of methods means that we load multiple rows ("by" denotes
that it's based on an unique key, not on an arbitrary query). This one
returns all rows whose unique key prefix matches the input.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | [`SelectByInput`](../type-aliases/SelectByInput.md)\<`TTable`, `TUniqueKey`\> |

#### Returns

[`Query`](../interfaces/Query.md)\<[`Row`](../type-aliases/Row.md)\<`TTable`\>[]\>

***

### select()

> `abstract` **select**(`input`): [`Query`](../interfaces/Query.md)\<[`Row`](../type-aliases/Row.md)\<`TTable`\>[]\>

Defined in: [src/abstract/Schema.ts:103](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L103)

Returns all rows matching an arbitrary query.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | [`SelectInput`](../type-aliases/SelectInput.md)\<`TTable`\> |

#### Returns

[`Query`](../interfaces/Query.md)\<[`Row`](../type-aliases/Row.md)\<`TTable`\>[]\>

***

### count()

> `abstract` **count**(`input`): [`Query`](../interfaces/Query.md)\<`number`\>

Defined in: [src/abstract/Schema.ts:108](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L108)

Returns the number of rows matching an arbitrary query.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | [`CountInput`](../type-aliases/CountInput.md)\<`TTable`\> |

#### Returns

[`Query`](../interfaces/Query.md)\<`number`\>

***

### exists()

> `abstract` **exists**(`input`): [`Query`](../interfaces/Query.md)\<`boolean`\>

Defined in: [src/abstract/Schema.ts:114](https://github.com/clickup/ent-framework/blob/master/src/abstract/Schema.ts#L114)

An optimized version of count() for the cases where we only need to know
whether at least one row exists, and don't need a precise count.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | [`ExistsInput`](../type-aliases/ExistsInput.md)\<`TTable`\> |

#### Returns

[`Query`](../interfaces/Query.md)\<`boolean`\>
