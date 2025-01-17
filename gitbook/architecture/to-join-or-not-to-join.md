# To Join or not to Join

Ent Framework encourages people to not use SQL JOINs. Instead, it relies on the in-app parallel Promises merging and query batching & coescing, for 2 main reasons:

1. It allows to work with microshards seamlessly (no JOINs can be run across the database boundaries).
2. It holistically solves [N+1 Selects problem](../getting-started/n+1-selects-solution.md).
