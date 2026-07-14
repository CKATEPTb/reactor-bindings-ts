/** Vue composables backed by the shared Publisher reconciliation store. */
import {
    computed,
    shallowRef,
    toValue,
    watch,
    type ComputedRef,
    type MaybeRefOrGetter,
    type ShallowRef
} from "vue";
import type {Publisher} from "reactor-core-ts";
import {isPublisher} from "@/shared/is-publisher.js";
import {PublisherExternalStore, emptyPublisherSnapshot} from "@/shared/publisher-store.js";
import type {PublisherSnapshotItem, PublisherValue} from "@/shared/publisher-value.js";
import type {PublisherKeySelector, PublisherRenderMode, PublisherSnapshot} from "@/shared/types.js";

/** Options accepted by the Vue Publisher composable. */
export interface UsePublisherOptions<T> {
    /** Append, latest, or authoritative snapshot mode. */
    readonly mode?: PublisherRenderMode;
    /** Optional stable key selector. */
    readonly keyBy?: PublisherKeySelector<T>;
}

/** Append/latest options accepted by the Vue Publisher composable. */
export interface UsePublisherAppendOptions<T> {
    /** Append emissions by default or retain one latest slot. */
    readonly mode?: "append" | "latest";
    /** Optional stable key selector. */
    readonly keyBy?: PublisherKeySelector<T>;
}

/** Snapshot options requiring an array-emitting Publisher. */
export interface UsePublisherSnapshotOptions<T> {
    /** Selects authoritative snapshot reconciliation. */
    readonly mode: "snapshot";
    /** Optional stable key selector. */
    readonly keyBy?: PublisherKeySelector<T>;
}

/**
 * Subscribes to a Publisher and exposes its currently reconciled values as a computed ref.
 *
 * @typeParam T - Rendered item type.
 * @param source - Publisher, ref, computed ref, or getter.
 * @param options - Reconciliation mode and key selector.
 * @returns Computed immutable ordered values.
 */
export function usePublisherValues<Source extends MaybeRefOrGetter<Publisher<unknown>>>(
    source: Source,
    options?: UsePublisherAppendOptions<PublisherValue<ResolvedPublisher<Source>>>
): ComputedRef<readonly PublisherValue<ResolvedPublisher<Source>>[]>;
export function usePublisherValues<Source extends MaybeRefOrGetter<Publisher<readonly unknown[]>>>(
    source: Source,
    options: UsePublisherSnapshotOptions<PublisherSnapshotItem<ResolvedPublisher<Source>>>
): ComputedRef<readonly PublisherSnapshotItem<ResolvedPublisher<Source>>[]>;
/** Implements item and authoritative snapshot Publisher overloads. */
export function usePublisherValues(
    source: MaybeRefOrGetter<Publisher<unknown | readonly unknown[]>>,
    options: UsePublisherOptions<never> = {}
): ComputedRef<readonly unknown[]> {
    const snapshot = usePublisherSnapshot(
        () => isPublisher<unknown | readonly unknown[]>(source)
            ? source
            : toValue(source),
        () => options.mode ?? "append",
        () => options.keyBy as PublisherKeySelector<unknown> | undefined
    );
    return computed(() => {
        const current = snapshot.value;
        if (current.failure) {
            throw current.failure.error;
        }
        return current.entries.map(entry => entry.value);
    });
}

/** Resolves a direct, callable, ref-backed, or getter-backed Publisher type. */
type ResolvedPublisher<Source> = Source extends Publisher<unknown>
    ? Source
    : Source extends () => infer Value
        ? Extract<Value, Publisher<unknown>>
        : Source extends ValueContainer<infer Value>
            ? Extract<Value, Publisher<unknown>>
            : never;

/** Minimal ref-like value container used only for type-level unwrapping. */
interface ValueContainer<Value> {
    /** Contained reactive value. */
    readonly value: Value;
}

/** Creates and disposes an external store as reactive inputs change. */
export function usePublisherSnapshot<T>(
    source: () => Publisher<T | readonly T[]> | undefined,
    mode: () => PublisherRenderMode,
    keyBy: () => PublisherKeySelector<T> | undefined
): Readonly<ShallowRef<PublisherSnapshot<T>>> {
    const snapshot = shallowRef<PublisherSnapshot<T>>(emptyPublisherSnapshot<T>());
    let activeStore: PublisherExternalStore<T> | undefined;
    watch([source, mode], ([currentSource, currentMode], _previous, onCleanup) => {
        if (!currentSource) {
            activeStore = undefined;
            snapshot.value = emptyPublisherSnapshot<T>();
            return;
        }
        const store = new PublisherExternalStore(currentSource, currentMode, keyBy());
        activeStore = store;
        const sync = (): void => {
            snapshot.value = store.getSnapshot();
        };
        const unsubscribe = store.subscribe(sync);
        sync();
        onCleanup(() => {
            unsubscribe();
            if (activeStore === store) {
                activeStore = undefined;
            }
        });
    }, {immediate: true, flush: "sync"});
    watch(keyBy, selector => activeStore?.setKeyBy(selector), {flush: "sync"});
    return snapshot;
}
