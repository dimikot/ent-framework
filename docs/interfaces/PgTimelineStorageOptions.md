[**ent-framework**](../README.md)

***

[ent-framework](../globals.md) / PgTimelineStorageOptions

# Interface: PgTimelineStorageOptions

Defined in: [src/pg/PgTimelineStorage.ts:14](https://github.com/clickup/ent-framework/blob/master/src/pg/PgTimelineStorage.ts#L14)

## Extends

- [`TimelineStorageOptions`](TimelineStorageOptions.md)

## Properties

| Property | Type |
| ------ | ------ |
| <a id="merge"></a> `merge?` | (`dataStrs`: `string`[]) => `string` |
| <a id="maxchunksperprincipal"></a> `maxChunksPerPrincipal?` | `MaybeCallable`\<`number`\> |
| <a id="cluster"></a> `cluster` | [`Cluster`](../classes/Cluster.md)\<[`PgClient`](../classes/PgClient.md)\<`Pool`\>, `any`\> |
| <a id="table"></a> `table?` | `string` |
