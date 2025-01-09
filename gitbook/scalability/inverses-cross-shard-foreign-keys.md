# Inverses, Cross Shard Foreign Keys

We already touched the topic of inverses and loading Ents across multiple microshards in [ent-api-select-by-expression.md](../getting-started/ent-api-select-by-expression.md "mention") article. We also noted that in many cases, it's better to colocate "related" Ents in one microshard: [shard-affinity-ent-colocation.md](shard-affinity-ent-colocation.md "mention").

Now, it's time to discuss how inverses work in details.

## Ents with Random Shard Affinity

Let's first build a pretty artificial "family" of the Ents, where each Ent is created in a random shard at insert time. (In real life, you'll likely want most of your Ents to be colocated to their parents, but to illustrate best, how inverses work, we'll make the opposite assumption).



