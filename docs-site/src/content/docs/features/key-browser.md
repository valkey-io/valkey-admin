---
title: Key Browser
description: Browse, search, and manage keys in your Valkey cluster
---

The Key Browser provides a powerful interface for exploring and managing keys stored in your Valkey cluster.

## Overview

Navigate through your keyspace with an intuitive interface that supports filtering, searching, and adding.

![Key Browser Interface](../../../assets/key_browser.png)

## Key Features

### Browsing Keys

- **Tree View**: Navigate keys organized by namespace separators (`:`)
- **List View**: View all keys in a flat list format
- **Pagination**: Handle large keyspaces efficiently
- **Sorting**: Sort by name, type, TTL, or size

### Search and Filter

#### Pattern Matching

Use Redis/Valkey pattern matching syntax:
```
user:*          # All keys starting with "user:"
*:session       # All keys ending with ":session"
user:*:cache    # Keys matching the pattern
```

#### Type Filtering

Filter keys by data type:
- **String**: Simple key-value pairs
- **Hash**: Field-value maps
- **List**: Ordered collections
- **Set**: Unordered unique collections
- **Sorted Set**: Scored, ordered sets
- **Stream**: Append-only logs
- **JSON**: ReJSON-style document values (requires the JSON module)

## Key Operations

### Viewing Keys

#### String Values
View string values with syntax highlighting for JSON, XML, and other formats.

#### Hash Fields
Display all fields and values in a table format.

#### List Elements
Browse list elements with pagination.

#### Set Members
View all members of a set.

#### Sorted Set Entries
Display entries with their scores.

### Editing Keys

- **Update Value**: Modify existing key values
- **Add Fields**: Insert new hash fields or list elements

## Key Details Panel

Click any key to view detailed information:

- **Name**: Key Name
- **Type**: Data structure type
- **Size**: Actual size in bytes
- **TTL**: Time to live (if set)

### Value Viewer

- **Raw View**: Display raw value for String types
- **Table View**: Hash, List, Set, Stream, and Zset types
- **Json View**: JSON data

## Switching Databases

Each `(host, port, db)` triple maps to its own client connection on the server, so the Key Browser is always scoped to the database you connected to. Switching to a different `db` opens a new client side-by-side with the existing one rather than issuing `SELECT` against an existing client, so operations like `KEYS`, `SET`, and `DEL` against one database never affect keys in another database on the same node. For cluster connections this only applies when the Valkey server is at version `9.0.0` or higher; earlier cluster servers always operate on `db` `0` and a non-zero `db` is rejected at connect time.

## Next Steps

- Execute commands with the [Send Command interface](/features/send-command/)
- Monitor key access with [Activity](/features/activity/)
- Visualize data distribution in [Cluster Topology](/features/cluster-topology/)
