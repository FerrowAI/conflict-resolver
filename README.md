# Conflict Resolver

Resolve data conflicts in distributed systems (CRDT-inspired).

```javascript
const resolver = new ConflictResolver();
const resolved = resolver.merge(localVersion, remoteVersion, {
  strategy: 'lastWrite'
});
```

Solves: Sync conflicts, offline-first apps, data consistency.
License: MIT
