/**
 * Renderer-independent keyed incremental and snapshot reconciliation.
 *
 * @packageDocumentation
 */
import type {
    PublisherEntry,
    PublisherKey,
    PublisherKeySelector,
    PublisherSnapshot
} from "@/shared/types.js";
import {isUnkeyedPublisherKey, latestPublisherKey} from "@/shared/keys.js";
import {
    indexPublisherSnapshotRetention,
    planPublisherSnapshotKeys
} from "@/shared/snapshot-plan.js";

/** Mutable entry metadata retained behind immutable snapshots. */
interface InternalEntry<T> extends PublisherEntry<T> {
    /** Current position in the ordered entry array. */
    readonly index: number;
}

/** Package-wide identity preventing cross-store renderer key collisions. */
let nextPublisherEntryId = 1;

/** Owns one independently subscribable sequence snapshot. */
export class PublisherSequenceStore<T> {
    /** Current immutable snapshot. */
    #snapshot: PublisherSnapshot<T> = {entries: [], revision: 0};
    /** Keyed entries with O(1) incremental updates. */
    #entriesByKey = new Map<PublisherKey, InternalEntry<T>>();
    /** Snapshot listeners. */
    readonly #listeners = new Set<() => void>();

    /** Stable external-store snapshot accessor. */
    readonly getSnapshot = (): PublisherSnapshot<T> => this.#snapshot;

    /** Registers a snapshot listener. */
    readonly subscribe = (listener: () => void): (() => void) => {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    };

    /** Appends an unkeyed value or upserts a keyed value. */
    append(value: T, keyBy?: PublisherKeySelector<T>): void {
        this.appendMany([value], keyBy);
    }

    /** Applies an append/upsert burst with one immutable array copy and notification. */
    appendMany(values: readonly T[], keyBy?: PublisherKeySelector<T>): void {
        if (values.length === 0) {
            return;
        }
        const entries = this.#snapshot.entries.slice() as InternalEntry<T>[];
        const entriesByKey = keyBy
            ? new Map(this.#entriesByKey)
            : this.#entriesByKey;
        for (const value of values) {
            if (!keyBy) {
                const id = nextPublisherEntryId++;
                entries.push({id, key: id, value, index: entries.length});
                continue;
            }
            const key = keyBy(value);
            if (isUnkeyedPublisherKey(key)) {
                const id = nextPublisherEntryId++;
                entries.push({id, key: id, value, index: entries.length});
                continue;
            }
            const existing = entriesByKey.get(key);
            if (existing) {
                const updated: InternalEntry<T> = {...existing, value};
                entries[existing.index] = updated;
                entriesByKey.set(key, updated);
                continue;
            }
            const entry: InternalEntry<T> = {
                id: nextPublisherEntryId++,
                key,
                value,
                index: entries.length
            };
            entries.push(entry);
            entriesByKey.set(key, entry);
        }
        this.#entriesByKey = entriesByKey;
        this.#publish(entries);
    }

    /** Updates the single slot used by latest-value mode. */
    latest(value: T): void {
        this.append(value, latestPublisherKey);
    }

    /** Reconciles a complete authoritative list snapshot. */
    applySnapshot(
        values: readonly T[],
        keyBy?: PublisherKeySelector<T>,
        rekeyExisting = false
    ): void {
        const keys = planPublisherSnapshotKeys(values, keyBy);
        if (!this.#snapshot.failure && this.#isEquivalentSnapshot(keys, values)) {
            return;
        }
        const previousByKey = rekeyExisting
            ? this.#rekeyedSnapshotEntries(keyBy)
            : this.#entriesByKey;
        const nextEntries = new Array<InternalEntry<T>>(keys.length);
        const nextByKey = new Map<PublisherKey, InternalEntry<T>>();
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index]!;
            const value = values[index]!;
            const previous = previousByKey.get(key);
            const entry: InternalEntry<T> = {
                id: previous?.id ?? nextPublisherEntryId++,
                key,
                value,
                index
            };
            nextEntries[index] = entry;
            nextByKey.set(key, entry);
        }
        this.#entriesByKey = nextByKey;
        this.#publish(nextEntries);
    }

    /** Re-indexes retained snapshot entries transactionally for a changed selector. */
    #rekeyedSnapshotEntries(keyBy?: PublisherKeySelector<T>): Map<PublisherKey, InternalEntry<T>> {
        const entries = this.#snapshot.entries as readonly InternalEntry<T>[];
        const values = entries.map(entry => entry.value);
        const rekeyed = new Map<PublisherKey, InternalEntry<T>>();
        for (const [key, index] of indexPublisherSnapshotRetention(values, keyBy)) {
            rekeyed.set(key, entries[index]!);
        }
        return rekeyed;
    }

    /** Rebuilds incremental keys after a selector changes without resubscribing upstream. */
    rekeyAppend(keyBy?: PublisherKeySelector<T>): void {
        if (this.#snapshot.entries.length === 0) {
            this.#entriesByKey.clear();
            return;
        }
        const previousEntries = this.#snapshot.entries as readonly InternalEntry<T>[];
        const nextEntries: InternalEntry<T>[] = [];
        const nextByKey = new Map<PublisherKey, InternalEntry<T>>();
        let changed = false;
        for (const previous of previousEntries) {
            const selectedKey = keyBy ? keyBy(previous.value) : previous.id;
            const unkeyed = isUnkeyedPublisherKey(selectedKey);
            const key = unkeyed ? previous.id : selectedKey;
            const retained = nextByKey.get(key);
            if (retained) {
                const updated: InternalEntry<T> = {...retained, value: previous.value};
                nextEntries[retained.index] = updated;
                nextByKey.set(key, updated);
                changed = true;
                continue;
            }
            const entry = Object.is(previous.key, key) && previous.index === nextEntries.length
                ? previous
                : {...previous, key, index: nextEntries.length};
            changed ||= entry !== previous;
            nextEntries.push(entry);
            if (keyBy && !unkeyed) {
                nextByKey.set(key, entry);
            }
        }
        this.#entriesByKey = nextByKey;
        if (changed) {
            this.#publish(nextEntries);
        }
    }

    /** Reports a terminal or reconciliation failure. */
    fail(error: unknown): void {
        this.#snapshot = {
            entries: this.#snapshot.entries,
            failure: {error},
            revision: this.#snapshot.revision + 1
        };
        this.#notify();
    }

    /** Removes all entries and failures. */
    clear(): void {
        this.#entriesByKey.clear();
        if (this.#snapshot.entries.length === 0 && !this.#snapshot.failure) {
            return;
        }
        this.#publish([]);
    }

    /** Publishes immutable ordered entries. */
    #publish(entries: readonly PublisherEntry<T>[]): void {
        this.#snapshot = {entries, revision: this.#snapshot.revision + 1};
        this.#notify();
    }

    /** Returns whether a snapshot is observably unchanged for immutable values. */
    #isEquivalentSnapshot(keys: readonly PublisherKey[], values: readonly T[]): boolean {
        const current = this.#snapshot.entries;
        if (current.length !== values.length) {
            return false;
        }
        for (let index = 0; index < current.length; index += 1) {
            const entry = current[index]!;
            const value = values[index]!;
            if (!Object.is(entry.key, keys[index]) || !Object.is(entry.value, value) || isMutable(value)) {
                return false;
            }
        }
        return true;
    }

    /** Notifies a stable copy so listeners may unsubscribe reentrantly. */
    #notify(): void {
        for (const listener of [...this.#listeners]) {
            listener();
        }
    }
}

/** Mutable references may have changed internally despite stable identity. */
function isMutable(value: unknown): boolean {
    return value !== null && (typeof value === "object" || typeof value === "function");
}
