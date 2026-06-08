[**ent-framework**](../README.md)

***

[ent-framework](../globals.md) / IDsCacheUpdatable

# Class: IDsCacheUpdatable

Defined in: [src/ent/predicates/Predicate.ts:47](https://github.com/clickup/ent-framework/blob/master/src/ent/predicates/Predicate.ts#L47)

## Extends

- [`IDsCache`](IDsCache.md)

## Constructors

### new IDsCacheUpdatable()

> **new IDsCacheUpdatable**(): [`IDsCacheUpdatable`](IDsCacheUpdatable.md)

#### Returns

[`IDsCacheUpdatable`](IDsCacheUpdatable.md)

#### Inherited from

[`IDsCache`](IDsCache.md).[`constructor`](IDsCache.md#constructors)

## Methods

### has()

> **has**(`Ent`, `id`): `boolean`

Defined in: [src/ent/IDsCache.ts:13](https://github.com/clickup/ent-framework/blob/master/src/ent/IDsCache.ts#L13)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `Ent` | `EntClassAlike` |
| `id` | `string` |

#### Returns

`boolean`

#### Inherited from

[`IDsCache`](IDsCache.md).[`has`](IDsCache.md#has)

***

### add()

> **add**(`Ent`, `id`, `value`): `void`

Defined in: [src/ent/IDsCache.ts:17](https://github.com/clickup/ent-framework/blob/master/src/ent/IDsCache.ts#L17)

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `Ent` | `EntClassAlike` | `undefined` |
| `id` | `string` | `undefined` |
| `value` | `boolean` | `true` |

#### Returns

`void`

#### Inherited from

[`IDsCache`](IDsCache.md).[`add`](IDsCache.md#add)

***

### get()

> **get**(`Ent`, `id`): `undefined` \| `boolean`

Defined in: [src/ent/IDsCache.ts:21](https://github.com/clickup/ent-framework/blob/master/src/ent/IDsCache.ts#L21)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `Ent` | `EntClassAlike` |
| `id` | `string` |

#### Returns

`undefined` \| `boolean`

#### Inherited from

[`IDsCache`](IDsCache.md).[`get`](IDsCache.md#get)
