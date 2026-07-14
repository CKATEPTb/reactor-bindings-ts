/** Shared authoritative snapshot validation and key planning. */
import type {PublisherKey, PublisherKeySelector} from "@/shared/types.js";

/** Validates and returns ordered snapshot keys without copying values. */
export function planPublisherSnapshotKeys<T>(
    values: readonly T[],
    keyBy?: PublisherKeySelector<T>
): readonly PublisherKey[] {
    const keys = new Array<PublisherKey>(values.length);
    const retained = new Set<PublisherKey>();
    for (let index = 0; index < values.length; index += 1) {
        const value = values[index]!;
        const key = keyBy ? keyBy(value) : index;
        if (retained.has(key)) {
            throw new Error(`Duplicate Publisher list key: ${String(key)}`);
        }
        retained.add(key);
        keys[index] = key;
    }
    return keys;
}
