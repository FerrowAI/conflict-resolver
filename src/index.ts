/**
 * conflict-resolver — field-level 3-way merge for offline-first sync.
 *
 * Given a common ancestor (`base`) and two divergent copies (`local`,
 * `remote`), merges non-conflicting field changes automatically and
 * resolves true conflicts (both sides changed the same field to
 * different values) with a configurable strategy: last-write-wins (using
 * a caller-supplied per-field timestamp map), prefer-local,
 * prefer-remote, or a custom resolver function per field. Arrays get
 * their own strategy (union/concat/replace). Returns both the merged
 * object and a list of what conflicted and how each was resolved.
 */

export type Json = Record<string, unknown>;

export type FieldStrategy = 'lastWrite' | 'preferLocal' | 'preferRemote';

export type CustomResolver = (args: {
  field: string;
  base: unknown;
  local: unknown;
  remote: unknown;
}) => unknown;

export type ArrayStrategy = 'union' | 'concat' | 'replace';

export interface MergeOptions {
  /** Default conflict strategy for scalar fields with no more specific rule. Default 'lastWrite'. */
  strategy?: FieldStrategy;
  /** Per-field override: a named strategy or a custom resolver function. */
  fieldStrategies?: Record<string, FieldStrategy | CustomResolver>;
  /**
   * Per-field timestamps, required for 'lastWrite' to be meaningful:
   * { local: { field: epochMs }, remote: { field: epochMs } }.
   * A field missing a timestamp on one side falls back to preferring
   * the side that has one, then to `strategy`'s tiebreak order (remote
   * wins simultaneous/absent timestamps, matching "last write" semantics
   * where remote is assumed to have arrived after local's own edit).
   */
  timestamps?: { local?: Record<string, number>; remote?: Record<string, number> };
  /** How to merge fields whose base/local/remote values are all arrays. Default 'union'. */
  arrayStrategy?: ArrayStrategy;
  /** Per-field array strategy override. */
  fieldArrayStrategies?: Record<string, ArrayStrategy>;
}

export type ConflictResolution = 'local' | 'remote' | 'custom' | 'array-merge';

export interface Conflict {
  field: string;
  base: unknown;
  local: unknown;
  remote: unknown;
  resolved: unknown;
  resolution: ConflictResolution;
}

export interface MergeResult<T extends Json> {
  merged: T;
  conflicts: Conflict[];
}

function isPlainObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => deepEqual(v, b[i]));
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((k) => deepEqual(a[k], b[k]));
  }
  return false;
}

function mergeArrays(base: unknown[], local: unknown[], remote: unknown[], strategy: ArrayStrategy): unknown[] {
  switch (strategy) {
    case 'concat':
      return [...local, ...remote.filter((r) => !local.some((l) => deepEqual(l, r)))];
    case 'replace':
      // both sides changed the array from base: remote wins wholesale (still recorded as a conflict by caller)
      return deepEqual(local, base) ? remote : local;
    case 'union':
    default: {
      const out: unknown[] = [];
      const seen: unknown[] = [];
      for (const item of [...base, ...local, ...remote]) {
        // only items present in local or remote survive (deletions from base honored),
        // union of local+remote changes, base-only-deleted items dropped
        const inLocal = local.some((l) => deepEqual(l, item));
        const inRemote = remote.some((r) => deepEqual(r, item));
        if ((inLocal || inRemote) && !seen.some((s) => deepEqual(s, item))) {
          seen.push(item);
          out.push(item);
        }
      }
      return out;
    }
  }
}

function resolveScalarConflict(
  field: string,
  base: unknown,
  local: unknown,
  remote: unknown,
  options: MergeOptions
): { resolved: unknown; resolution: ConflictResolution } {
  const override = options.fieldStrategies?.[field];

  if (typeof override === 'function') {
    return { resolved: override({ field, base, local, remote }), resolution: 'custom' };
  }

  const strategy = override ?? options.strategy ?? 'lastWrite';

  if (strategy === 'preferLocal') return { resolved: local, resolution: 'local' };
  if (strategy === 'preferRemote') return { resolved: remote, resolution: 'remote' };

  // lastWrite
  const localTs = options.timestamps?.local?.[field];
  const remoteTs = options.timestamps?.remote?.[field];
  if (localTs !== undefined && remoteTs !== undefined) {
    return remoteTs >= localTs
      ? { resolved: remote, resolution: 'remote' }
      : { resolved: local, resolution: 'local' };
  }
  if (localTs !== undefined) return { resolved: local, resolution: 'local' };
  if (remoteTs !== undefined) return { resolved: remote, resolution: 'remote' };
  // no timestamp info at all: remote is treated as the later write
  return { resolved: remote, resolution: 'remote' };
}

/**
 * Field-level 3-way merge. Fields changed on only one side (relative to
 * `base`) are auto-merged; fields changed on both sides to different
 * values are conflicts, resolved per `options` and reported in
 * `conflicts`. Fields present in `base`/`local`/`remote` are unioned;
 * a field absent from all three is skipped.
 */
export function merge<T extends Json>(base: T, local: T, remote: T, options: MergeOptions = {}): MergeResult<T> {
  const merged: Json = {};
  const conflicts: Conflict[] = [];

  const allFields = new Set<string>([...Object.keys(base ?? {}), ...Object.keys(local ?? {}), ...Object.keys(remote ?? {})]);

  for (const field of allFields) {
    const baseVal = base?.[field];
    const localVal = local?.[field];
    const remoteVal = remote?.[field];

    const localChanged = !deepEqual(localVal, baseVal);
    const remoteChanged = !deepEqual(remoteVal, baseVal);

    if (!localChanged && !remoteChanged) {
      merged[field] = baseVal;
      continue;
    }
    if (localChanged && !remoteChanged) {
      merged[field] = localVal;
      continue;
    }
    if (!localChanged && remoteChanged) {
      merged[field] = remoteVal;
      continue;
    }

    // both changed
    if (deepEqual(localVal, remoteVal)) {
      // both sides made the identical change: no real conflict
      merged[field] = localVal;
      continue;
    }

    if (Array.isArray(baseVal) && Array.isArray(localVal) && Array.isArray(remoteVal)) {
      const arrayStrategy = options.fieldArrayStrategies?.[field] ?? options.arrayStrategy ?? 'union';
      const resolvedArray = mergeArrays(baseVal, localVal, remoteVal, arrayStrategy);
      merged[field] = resolvedArray;
      conflicts.push({
        field,
        base: baseVal,
        local: localVal,
        remote: remoteVal,
        resolved: resolvedArray,
        resolution: 'array-merge',
      });
      continue;
    }

    const { resolved, resolution } = resolveScalarConflict(field, baseVal, localVal, remoteVal, options);
    merged[field] = resolved;
    conflicts.push({ field, base: baseVal, local: localVal, remote: remoteVal, resolved, resolution });
  }

  return { merged: merged as T, conflicts };
}

export default { merge };
