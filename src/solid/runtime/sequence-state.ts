/** Keyed incremental and snapshot reconciliation state specialized for Solid. */
import {createSignal, type Accessor, type JSX, type Owner, type Setter} from "solid-js";
import {isUnkeyedPublisherKey} from "@/shared/keys.js";
import {
    indexPublisherSnapshotRetention,
    planPublisherSnapshotKeys
} from "@/shared/snapshot-plan.js";
import type {PublisherKey, PublisherKeySelector} from "@/shared/types.js";
import {createSequenceEntry, type SequenceEntry} from "@/solid/runtime/sequence-entry.js";

/** Maintains ordered, independently owned JSX entries for a Publisher. */
export class SequenceState<T> {
    /** Reactive ordered accessors consumed by the runtime component. */
    readonly view: Accessor<readonly Accessor<JSX.Element>[]>;
    /** Rendered entries indexed by reconciliation key. */
    #entries = new Map<PublisherKey, SequenceEntry<T>>();
    /** Setter for the reactive rendered-accessor order. */
    readonly #setView: Setter<readonly Accessor<JSX.Element>[]>;
    /** Mutable accessor buffer published through an always-invalidating signal. */
    #views: Accessor<JSX.Element>[] = [];
    /** Entries in the same order as the rendered accessor list. */
    #orderedEntries: SequenceEntry<T>[] = [];

    /** Creates empty sequence state under a Solid owner. */
    constructor(
        readonly owner: Owner,
        readonly render: (value: T, index: number, values: readonly T[]) => JSX.Element,
        readonly contextual = false
    ) {
        const [view, setView] = createSignal<readonly Accessor<JSX.Element>[]>(this.#views, {
            equals: false
        });
        this.#setView = setView;
        this.view = view;
    }

    /** Appends an unkeyed value or upserts a keyed value. */
    append(value: T, keyBy?: PublisherKeySelector<T>): void {
        const selectedKey = keyBy?.(value);
        const key = keyBy && !isUnkeyedPublisherKey(selectedKey)
            ? selectedKey
            : Symbol("Publisher.unkeyed");
        const existingEntry = this.#entries.get(key);
        if (existingEntry) {
            existingEntry.update(value);
            return;
        }
        const entry = this.#create(value, this.#views.length);
        this.#entries.set(key, entry);
        this.#orderedEntries.push(entry);
        this.#views.push(entry.view);
        this.#setView(this.#views);
    }

    /** Rebuilds incremental keys transactionally after a selector changes. */
    rekey(keyBy?: PublisherKeySelector<T>): void {
        const nextEntries = new Map<PublisherKey, SequenceEntry<T>>();
        const nextOrder: SequenceEntry<T>[] = [];
        const updates = new Map<SequenceEntry<T>, T>();
        const removed = new Set<SequenceEntry<T>>();
        for (const entry of this.#orderedEntries) {
            const value = entry.sourceValue();
            const selectedKey = keyBy?.(value);
            const key = keyBy && !isUnkeyedPublisherKey(selectedKey)
                ? selectedKey
                : Symbol("Publisher.unkeyed");
            const retained = nextEntries.get(key);
            if (retained) {
                retained.validate(value);
                updates.set(retained, value);
                removed.add(entry);
                continue;
            }
            nextEntries.set(key, entry);
            nextOrder.push(entry);
        }
        for (const [entry, value] of updates) {
            entry.update(value);
        }
        for (const entry of removed) {
            entry.dispose();
        }
        this.#entries = nextEntries;
        this.#orderedEntries = nextOrder;
        const nextViews = nextOrder.map(entry => entry.view);
        if (!sameOrder(this.#views, nextViews)) {
            this.#views = nextViews;
            this.#setView(nextViews);
        }
    }

    /** Reconciles one complete authoritative snapshot. */
    applySnapshot(
        values: readonly T[],
        keyBy?: PublisherKeySelector<T>,
        rekeyExisting = false
    ): void {
        const keys = planPublisherSnapshotKeys(values, keyBy);
        const previousByKey = rekeyExisting
            ? this.#rekeyedSnapshotEntries(keyBy)
            : this.#entries;
        for (let index = 0; index < keys.length; index += 1) {
            previousByKey.get(keys[index]!)?.validate(values[index]!);
        }
        const nextViews = new Array<Accessor<JSX.Element>>(keys.length);
        const nextEntries = new Array<SequenceEntry<T>>(keys.length);
        const nextByKey = new Map<PublisherKey, SequenceEntry<T>>();
        for (let index = 0; index < keys.length; index += 1) {
            const key = keys[index]!;
            const value = values[index]!;
            const entry = previousByKey.get(key) ?? this.#create(value, index, values);
            if (previousByKey.has(key)) {
                entry.update(value);
            }
            nextEntries[index] = entry;
            nextViews[index] = entry.view;
            nextByKey.set(key, entry);
        }
        if (this.contextual) {
            const renderValues = nextEntries.map(entry => entry.value());
            for (let index = 0; index < nextEntries.length; index += 1) {
                nextEntries[index]!.updateContext(index, renderValues);
            }
        }
        const retainedEntries = new Set(nextEntries);
        for (const entry of this.#orderedEntries) {
            if (!retainedEntries.has(entry)) {
                entry.dispose();
            }
        }
        this.#entries = nextByKey;
        if (!sameOrder(this.#views, nextViews)) {
            this.#views = nextViews;
            this.#setView(nextViews);
        }
        this.#orderedEntries = nextEntries;
    }

    /** Re-indexes unambiguous retained snapshot entries for a changed selector. */
    #rekeyedSnapshotEntries(
        keyBy?: PublisherKeySelector<T>
    ): Map<PublisherKey, SequenceEntry<T>> {
        const values = this.#orderedEntries.map(entry => entry.sourceValue());
        const entries = new Map<PublisherKey, SequenceEntry<T>>();
        for (const [key, index] of indexPublisherSnapshotRetention(values, keyBy)) {
            entries.set(key, this.#orderedEntries[index]!);
        }
        return entries;
    }

    /** Disposes every entry and resets sequence identity state. */
    clear(): void {
        if (this.#entries.size === 0) {
            return;
        }
        for (const entry of this.#entries.values()) {
            entry.dispose();
        }
        this.#entries.clear();
        this.#orderedEntries = [];
        this.#views = [];
        this.#setView(this.#views);
    }

    /** Creates an owned entry for a new value. */
    #create(value: T, index = 0, values: readonly T[] = []): SequenceEntry<T> {
        return createSequenceEntry(
            this.owner,
            value,
            this.render,
            index,
            values,
            this.contextual
        );
    }

}

/** Returns whether two accessor arrays have identical reference order. */
function sameOrder(
    left: readonly Accessor<JSX.Element>[],
    right: readonly Accessor<JSX.Element>[]
): boolean {
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
}
