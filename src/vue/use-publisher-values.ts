/** Vue composables backed by the shared Publisher reconciliation store. */
import {
    computed,
    shallowRef,
    toValue,
    watchEffect,
    type ComputedRef,
    type MaybeRefOrGetter,
    type ShallowRef
} from "vue";
import type {Publisher} from "reactor-core-ts";
import {PublisherExternalStore, emptyPublisherSnapshot} from "@/shared/publisher-store.js";
import type {PublisherKeySelector, PublisherRenderMode, PublisherSnapshot} from "@/shared/types.js";

/** Options accepted by the Vue Publisher composable. */
export interface UsePublisherOptions<T> {
    /** Append, latest, or authoritative snapshot mode. */
    readonly mode?: PublisherRenderMode;
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
export function usePublisherValues<T>(
    source: MaybeRefOrGetter<Publisher<T | readonly T[]>>,
    options: UsePublisherOptions<T> = {}
): ComputedRef<readonly T[]> {
    const snapshot = usePublisherSnapshot(
        () => toValue(source),
        () => options.mode ?? "append",
        () => options.keyBy
    );
    return computed(() => {
        const current = snapshot.value;
        if (current.failure) {
            throw current.failure.error;
        }
        return current.entries.map(entry => entry.value);
    });
}

/** Creates and disposes an external store as reactive inputs change. */
export function usePublisherSnapshot<T>(
    source: () => Publisher<T | readonly T[]> | undefined,
    mode: () => PublisherRenderMode,
    keyBy: () => PublisherKeySelector<T> | undefined
): Readonly<ShallowRef<PublisherSnapshot<T>>> {
    const snapshot = shallowRef<PublisherSnapshot<T>>(emptyPublisherSnapshot<T>());
    watchEffect(onCleanup => {
        const currentSource = source();
        if (!currentSource) {
            snapshot.value = emptyPublisherSnapshot<T>();
            return;
        }
        const store = new PublisherExternalStore(currentSource, mode(), keyBy());
        const sync = (): void => {
            snapshot.value = store.getSnapshot();
        };
        const unsubscribe = store.subscribe(sync);
        sync();
        onCleanup(unsubscribe);
    });
    return snapshot;
}
