[**ent-framework**](../README.md)

***

[ent-framework](../globals.md) / TimelineStorage

# Class: `abstract` TimelineStorage

Defined in: [src/ent/TimelineStorage.ts:14](https://github.com/clickup/ent-framework/blob/master/src/ent/TimelineStorage.ts#L14)

An abstract class that defines the interface for loading and storing
timelines per VC principals.

## Extended by

- [`PgTimelineStorage`](PgTimelineStorage.md)

## Constructors

### new TimelineStorage()

> **new TimelineStorage**(`options`): [`TimelineStorage`](TimelineStorage.md)

Defined in: [src/ent/TimelineStorage.ts:43](https://github.com/clickup/ent-framework/blob/master/src/ent/TimelineStorage.ts#L43)

Initializes an instance of TimelineStorage.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`TimelineStorageOptions`](../interfaces/TimelineStorageOptions.md) |

#### Returns

[`TimelineStorage`](TimelineStorage.md)

## Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="default_options"></a> `DEFAULT_OPTIONS` | `Required`\<`PickPartial`\<[`TimelineStorageOptions`](../interfaces/TimelineStorageOptions.md)\>\> | Default values for the constructor options. |
| <a id="options-1"></a> `options` | `Required`\<[`TimelineStorageOptions`](../interfaces/TimelineStorageOptions.md)\> | Client configuration options. |

## Methods

### load()

> `abstract` **load**(`principal`): `Promise`\<`string`[]\>

Defined in: [src/ent/TimelineStorage.ts:33](https://github.com/clickup/ent-framework/blob/master/src/ent/TimelineStorage.ts#L33)

Loads the timelines from the storage for a given principal.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `principal` | `string` |

#### Returns

`Promise`\<`string`[]\>

***

### save()

> `abstract` **save**(`principal`, `dataStr`): `Promise`\<`void`\>

Defined in: [src/ent/TimelineStorage.ts:38](https://github.com/clickup/ent-framework/blob/master/src/ent/TimelineStorage.ts#L38)

Saves the timelines in the storage for a given principal.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `principal` | `string` |
| `dataStr` | `string` |

#### Returns

`Promise`\<`void`\>
