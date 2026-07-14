/** Shared authoritative snapshot validation and key planning. */
import type {PublisherKey, PublisherKeySelector} from "@/shared/types.js";

/** Validates and returns ordered snapshot keys without copying values. */
export function planPublisherSnapshotKeys<T>(
    values: readonly T[],
    keyBy?: PublisherKeySelector<T>
): readonly PublisherKey[] {
    const keys = new Array<PublisherKey>(values.length);
    if (!keyBy) {
        for (let index = 0; index < values.length; index += 1) {
            keys[index] = index;
        }
        return keys;
    }
    const retained = new Set<PublisherKey>();
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index]!;
        const key = callSnapshotKeySelector(keyBy, value, index, values);
        if (retained.has(key)) {
            throw new Error(`Duplicate Publisher list key: ${String(key)}`);
        }
        retained.add(key);
        keys[index] = key;
    }
    return keys;
}

/** Indexes only unambiguous existing keys when a snapshot selector changes. */
export function indexPublisherSnapshotRetention<T>(
    values: readonly T[],
    keyBy?: PublisherKeySelector<T>
): ReadonlyMap<PublisherKey, number> {
    const retained = new Map<PublisherKey, number>();
    if (!keyBy) {
        for (let index = 0; index < values.length; index += 1) {
            retained.set(index, index);
        }
        return retained;
    }
    const ambiguous = new Set<PublisherKey>();
    for (let index = 0; index < values.length; index += 1) {
        let key: PublisherKey;
        try {
            key = callSnapshotKeySelector(keyBy, values[index]!, index, values);
        } catch {
            // Retention is best-effort; the incoming authoritative snapshot is validated strictly.
            continue;
        }
        if (ambiguous.has(key)) {
            continue;
        }
        if (retained.has(key)) {
            retained.delete(key);
            ambiguous.add(key);
        } else {
            retained.set(key, index);
        }
    }
    return retained;
}

/** Calls a selector with native `Array.map` snapshot context when it accepts it. */
function callSnapshotKeySelector<T>(
    keyBy: PublisherKeySelector<T>,
    value: T,
    index: number,
    values: readonly T[]
): PublisherKey {
    return (keyBy as (
        current: T,
        currentIndex: number,
        currentValues: readonly T[]
    ) => PublisherKey)(value, index, values);
}
