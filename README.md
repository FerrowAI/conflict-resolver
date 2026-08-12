# conflict-resolver
![CI](https://github.com/FerrowAI/conflict-resolver/actions/workflows/ci.yml/badge.svg)

Field-level 3-way merge for offline-first sync, in TypeScript/Node. Given
a common ancestor (`base`) and two divergent copies (`local`, `remote`),
`merge()` auto-merges fields changed on only one side, resolves true
conflicts (both sides changed the same field to different values) with a
configurable strategy, and returns both the merged object and a list of
every conflict with how it was resolved. Zero runtime dependencies.

## Install

Copy `src/index.ts` into your project, or build this repo (`npm run build`)
and depend on the compiled `dist/`.

## Quickstart

```ts
import { merge } from 'conflict-resolver';

const { merged, conflicts } = merge(base, local, remote, {
  strategy: 'lastWrite',
  timestamps: {
    local: { title: 1000 },
    remote: { title: 2000 },
  },
});
```

- Fields unchanged on both sides pass through from `base`.
- Fields changed on only one side pass through from whichever side changed.
- Fields changed identically on both sides merge with no reported conflict.
- Fields changed differently on both sides are conflicts: resolved per
  strategy and pushed onto `conflicts`.

## API

```ts
merge<T>(base: T, local: T, remote: T, options?: MergeOptions): { merged: T; conflicts: Conflict[] }
```

`MergeOptions`:
- `strategy?: 'lastWrite' | 'preferLocal' | 'preferRemote'` — default
  strategy for scalar-field conflicts (default `'lastWrite'`).
- `fieldStrategies?: Record<string, FieldStrategy | CustomResolver>` —
  per-field override, either a named strategy or
  `({ field, base, local, remote }) => resolvedValue`.
- `timestamps?: { local?: Record<string, number>; remote?: Record<string, number> }` —
  per-field epoch-ms timestamps used by `'lastWrite'`. If only one side has
  a timestamp for a field, that side wins; if neither does, remote wins
  (treated as the later write).
- `arrayStrategy?: 'union' | 'concat' | 'replace'` — how to merge a field
  whose base/local/remote values are all arrays (default `'union'`):
  `union` keeps items present in local or remote (dedup by deep-equality,
  base-only-removed items dropped); `concat` appends remote items not
  already in local; `replace` picks whichever side actually changed from
  base (remote if both did).
- `fieldArrayStrategies?: Record<string, ArrayStrategy>` — per-field
  array strategy override.

Each `Conflict` is `{ field, base, local, remote, resolved, resolution }`
where `resolution` is `'local' | 'remote' | 'custom' | 'array-merge'`.

## Scope and limits

- Field-level, one level deep — nested objects are compared and merged as
  opaque values (deep-equal for change detection), not recursively
  merged field-by-field. Flatten nested state yourself first if you need
  per-nested-field resolution.
- `'lastWrite'` needs you to supply timestamps; it does not read or infer
  wall-clock time itself.
- Array `union`/`concat` dedupe by deep equality, which is O(n·m) per
  field — fine for typical sync payloads, not built for huge arrays.
- This is a merge algorithm, not a sync transport — it doesn't fetch
  `base`/`local`/`remote` for you or persist the result.

Sponsored by [Ferrow](https://ferrow.ai)

---
Part of the [ferrow-toolkit](https://github.com/FerrowAI/ferrow-toolkit) collection · Sponsored by [Ferrow](https://ferrow.ai)
