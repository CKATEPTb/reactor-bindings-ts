/** Keyed incremental and snapshot reconciliation state specialized for Solid. */
import {createSignal, type Accessor, type JSX, type Owner, type Setter} from "solid-js";
import {planPublisherSnapshotKeys} from "@/shared/snapshot-plan.js";
import type {PublisherKey, PublisherKeySelector} from "@/shared/types.js";
import {createSequenceEntry, type SequenceEntry} from "@/solid/runtime/sequence-entry.js";

/** Maintains ordered, independently owned JSX entries for a Publisher. */
export class SequenceState<T> {
    /** Reactive ordered accessors consumed by the runtime component. */
    readonly view: Accessor<readonly Accessor<JSX.Element>[]>;
    /** Rendered entries indexed by reconciliation key. */
    readonly #entries = new Map<PublisherKey, SequenceEntry<T>>();
    /** Setter for the reactive rendered-accessor order. */
    readonly #setView: Setter<readonly Accessor<JSX.Element>[]>;
    /** Mutable accessor buffer published through an always-invalidating signal. */
    #views: Accessor<JSX.Element>[] = [];

    /** Creates empty sequence state under a Solid owner. */
    constructor(
        readonly owner: Owner,
        readonly render: (value: T) => JSX.Element
    ) {
        const [view, setView] = createSignal<readonly Accessor<JSX.Element>[]>(this.#views, {
            equals: false
        });
        this.#setView = setView;
        this.view = view;
    }

    /** Appends an unkeyed value or upserts a keyed value. */
    append(value: T, keyBy?: PublisherKeySelector<T>): void {
        const key = keyBy ? keyBy(value) : Symbol("Publisher.unkeyed");
        const existingEntry = this.#entries.get(key);
        if (existingEntry) {
            existingEntry.update(value);
            return;
        }
        const entry = this.#create(value);
        this.#entries.set(key, entry);
        this.#views.push(entry.view);
        this.#setView(this.#views);
    }

    /** Reconciles one complete authoritative snapshot. */
    applySnapshot(values: readonly T[], keyBy?: PublisherKeySelector<T>): void {
        const keys = planPublisherSnapshotKeys(values, keyBy);
        const retained = new Set(keys);
        for (let index = 0; index < keys.length; index += 1) {
            this.#entries.get(keys[index]!)?.validate(values[index]!);
        }
        const nextViews = new Array<Accessor<JSX.Element>>(keys.length);
        for (let index = 0; index < keys.length; index += 1) {
            nextViews[index] = this.#upsert(keys[index]!, values[index]!).view;
        }
        for (const key of this.#entries.keys()) {
            if (!retained.has(key)) {
                this.#remove(key);
            }
        }
        if (!sameOrder(this.#views, nextViews)) {
            this.#views = nextViews;
            this.#setView(nextViews);
        }
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
        this.#views = [];
        this.#setView(this.#views);
    }

    /** Creates an owned entry for a new value. */
    #create(value: T): SequenceEntry<T> {
        return createSequenceEntry(this.owner, value, this.render);
    }

    /** Updates an existing entry or creates it when absent. */
    #upsert(key: PublisherKey, value: T): SequenceEntry<T> {
        const entry = this.#entries.get(key);
        if (entry) {
            entry.update(value);
            return entry;
        }
        const created = this.#create(value);
        this.#entries.set(key, created);
        return created;
    }

    /** Removes and disposes one keyed entry. */
    #remove(key: PublisherKey): void {
        const entry = this.#entries.get(key);
        if (!entry) {
            return;
        }
        this.#entries.delete(key);
        entry.dispose();
    }
}

/** Returns whether two accessor arrays have identical reference order. */
function sameOrder(
    left: readonly Accessor<JSX.Element>[],
    right: readonly Accessor<JSX.Element>[]
): boolean {
    return left.length === right.length && left.every((entry, index) => entry === right[index]);
}
