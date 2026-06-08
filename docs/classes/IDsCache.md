[**ent-framework**](../README.md)

***

[ent-framework](../globals.md) / IDsCache

# Class: `abstract` IDsCache

Defined in: [src/ent/IDsCache.ts:10](https://github.com/clickup/ent-framework/blob/master/src/ent/IDsCache.ts#L10)

## Extended by

- [`IDsCacheReadable`](IDsCacheReadable.md)
- [`IDsCacheUpdatable`](IDsCacheUpdatable.md)
- [`IDsCacheDeletable`](IDsCacheDeletable.md)
- [`IDsCacheCanReadIncomingEdge`](IDsCacheCanReadIncomingEdge.md)

## Constructors

### new IDsCache()

> **new IDsCache**(): [`IDsCache`](IDsCache.md)

#### Returns

[`IDsCache`](IDsCache.md)

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
