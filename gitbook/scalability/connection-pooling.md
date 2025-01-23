# Connection Pooling

When `min` client option is provided in the [cluster configuration](../getting-started/connect-to-a-database.md), Ent Framework maintains up to this number of established database connections ("pre-warmed"), even when there are no queries coming. This allows for the new queries to execute quickly: establishing a new connectioon is an expensive process that may take tens of milliseconds and involve multiple round-trips to the server (especially when using SSL-encryption).

At the same time, having many persistent connection in some databases is expensive as well. For instance, PostgreSQL architecture implies that there is one independent OS process behind every single active connection. So setting PostgreSQL config's [max\_connections](https://www.postgresql.org/docs/current/runtime-config-connection.html) to a value larger than \~100 (varies depending on the number of CPU cores on the server and available memory) is not the best idea.

Imagine you have one database server and 20 Node app processes running in your cluster. If each app opens 5 persistent connections to the database, you'll exhaust that 100 cap mentioned above, and it's not even considered a large cluster.
