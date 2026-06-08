[**ent-framework**](../README.md)

***

[ent-framework](../globals.md) / Timeline

# Class: Timeline

Defined in: [src/abstract/Timeline.ts:36](https://github.com/clickup/ent-framework/blob/master/src/abstract/Timeline.ts#L36)

Tracks replication lag timeline position at master per "user" and Ent.
- serialization format: "pos:expiresAt"
- wipes expired records (expiration is calculated at assignment moment)

How replication lag (timeline) tracking works: for each
microshard+Ent+"user", we know the “last write-ahead log write position”
which that user (typically, VC#principal) made recently. This info can be
propagated through e.g. user's session and push notifications/subscriptions
channels automatically (“serialized timeline” and “timelines merging”). So
the next time the same user tries to read the data from the same Ent on the
same microshard, Ent Framework makes a choice, whether the replica is “good
enough” for this already; if not, it falls back to master read. I.e. the data
is not granular to individual Ent ID, it’s granular to the
user+Ent+microshard, and thus it is decoupled from IDs.

## Constructors

### new Timeline()

> **new Timeline**(`state`): [`Timeline`](Timeline.md)

Defined in: [src/abstract/Timeline.ts:39](https://github.com/clickup/ent-framework/blob/master/src/abstract/Timeline.ts#L39)

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `state` | \{ `pos`: `bigint`; `expiresAt`: `number`; \} \| `"unknown"` | `"unknown"` |

#### Returns

[`Timeline`](Timeline.md)

## Methods

### deserialize()

> `static` **deserialize**(`data`, `prevTimeline`): [`Timeline`](Timeline.md)

Defined in: [src/abstract/Timeline.ts:45](https://github.com/clickup/ent-framework/blob/master/src/abstract/Timeline.ts#L45)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `undefined` \| `string` |
| `prevTimeline` | `null` \| [`Timeline`](Timeline.md) |

#### Returns

[`Timeline`](Timeline.md)

***

### cloneMap()

> `static` **cloneMap**(`timelines`): `Map`\<`string`, [`Timeline`](Timeline.md)\>

Defined in: [src/abstract/Timeline.ts:67](https://github.com/clickup/ent-framework/blob/master/src/abstract/Timeline.ts#L67)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `timelines` | `ReadonlyMap`\<`string`, [`Timeline`](Timeline.md)\> |

#### Returns

`Map`\<`string`, [`Timeline`](Timeline.md)\>

***

### serialize()

> **serialize**(): `undefined` \| `string`

Defined in: [src/abstract/Timeline.ts:80](https://github.com/clickup/ent-framework/blob/master/src/abstract/Timeline.ts#L80)

#### Returns

`undefined` \| `string`

***

### setPos()

> **setPos**(`pos`, `maxLagMs`): `void`

Defined in: [src/abstract/Timeline.ts:87](https://github.com/clickup/ent-framework/blob/master/src/abstract/Timeline.ts#L87)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pos` | `bigint` |
| `maxLagMs` | `number` |

#### Returns

`void`

***

### isCaughtUp()

> **isCaughtUp**(`replicaPos`): [`TimelineCaughtUpReason`](../type-aliases/TimelineCaughtUpReason.md)

Defined in: [src/abstract/Timeline.ts:100](https://github.com/clickup/ent-framework/blob/master/src/abstract/Timeline.ts#L100)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `replicaPos` | `bigint` |

#### Returns

[`TimelineCaughtUpReason`](../type-aliases/TimelineCaughtUpReason.md)

***

### isSaved()

> **isSaved**(): `boolean`

Defined in: [src/abstract/Timeline.ts:110](https://github.com/clickup/ent-framework/blob/master/src/abstract/Timeline.ts#L110)

#### Returns

`boolean`

***

### setIsSaved()

> **setIsSaved**(): `void`

Defined in: [src/abstract/Timeline.ts:118](https://github.com/clickup/ent-framework/blob/master/src/abstract/Timeline.ts#L118)

#### Returns

`void`

***

### reset()

> **reset**(): `void`

Defined in: [src/abstract/Timeline.ts:122](https://github.com/clickup/ent-framework/blob/master/src/abstract/Timeline.ts#L122)

#### Returns

`void`
