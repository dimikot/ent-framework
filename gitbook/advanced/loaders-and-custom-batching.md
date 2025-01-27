# Loaders and Custom Batching

One of the key features of Ent Framework is a holistic [n+1-selects-solution.md](../getting-started/n+1-selects-solution.md "mention"). When you run the calls addressing a single row in the database (read or write), the engine batches that calls into compound SQL queries, which allows to save a lot on round trip time.

The core of that idea lies in Meta's [DataLoader](https://github.com/graphql/dataloader) pattern, which initially was invented for just one case, loading an object by its ID. Ent Framework generalizes DataLoader to _all_ read and write operations.
