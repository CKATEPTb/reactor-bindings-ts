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
import {latestPublisherKey} from "@/shared/keys.js";
import {planPublisherSnapshotKeys} from "@/shared/snapshot-plan.js";

/** Mutable entry metadata retained behind immutable snapshots. */
interface InternalEntry<T> extends PublisherEntry<T> {
    /** Current position in the ordered entry array. */
    readonly index: number;
}

/** Owns one independently subscribable sequence snapshot. */
export class PublisherSequenceStore<T> {
    /** Current immutable snapshot. */
    #snapshot: PublisherSnapshot<T> = {entries: [], revision: 0};
    /** Keyed entries with O(1) incremental updates. */
    #entriesByKey = new Map<PublisherKey, InternalEntry<T>>();
    /** Next framework-safe entry identity. */
    #nextId = 1;
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
        const key = keyBy ? keyBy(value) : Symbol("Publisher.append");
        const existing = this.#entriesByKey.get(key);
        if (existing) {
            const entries = this.#snapshot.entries.slice();
            const updated: InternalEntry<T> = {...existing, value};
            entries[existing.index] = updated;
            this.#entriesByKey.set(key, updated);
            this.#publish(entries);
            return;
        }
        const entries = this.#snapshot.entries.slice();
        const entry: InternalEntry<T> = {
            id: this.#nextId++,
            key,
            value,
            index: entries.length
        };
        entries.push(entry);
        this.#entriesByKey.set(key, entry);
        this.#publish(entries);
    }

    /** Updates the single slot used by latest-value mode. */
    latest(value: T): void {
        this.append(value, latestPublisherKey);
    }

    /** Reconciles a complete authoritative list snapshot. */
    applySnapshot(values: readonly T[], keyBy?: PublisherKeySelector<T>): void {
        const keys = planPublisherSnapshotKeys(values, keyBy);
        const nextEntries = new Array<InternalEntry<T>>(keys.length);
        const nextByKey = new Map<PublisherKey, InternalEntry<T>>();
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index]!;
            const value = values[index]!;
            const previous = this.#entriesByKey.get(key);
            const entry: InternalEntry<T> = {
                id: previous?.id ?? this.#nextId++,
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

    /** Notifies a stable copy so listeners may unsubscribe reentrantly. */
    #notify(): void {
        for (const listener of [...this.#listeners]) {
            listener();
        }
    }
}
