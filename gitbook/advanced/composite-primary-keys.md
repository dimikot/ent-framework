# Composite Primary Keys

In each Ent instance, there is always a property named `id`.&#x20;

Ent Framework follows the pattern "convention over configuration" to simplify the most frequent use cases. In the world of database, the approach of having an explicit primary key `id` field (typically, generated based on some sequence) is considered a best practice.

There are still databases where it's not the case. You can use Ent Framework for them by utilizing the composite (or custom) primary keys feature.

