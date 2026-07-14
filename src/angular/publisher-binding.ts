/** Angular-independent lifecycle binding used by directives and pipes. */
import type {Publisher} from "reactor-core-ts";
import {PublisherExternalStore, emptyPublisherSnapshot} from "@/shared/publisher-store.js";
import type {PublisherKeySelector, PublisherRenderMode, PublisherSnapshot} from "@/shared/types.js";

/** Owns one lazily subscribed Publisher store for an Angular consumer. */
export class PublisherBinding<T> {
    /** Current external store. */
    #store: PublisherExternalStore<T> | undefined;
    /** Current external-store listener teardown. */
    #unsubscribe: (() => void) | undefined;
    /** Last connected inputs. */
    #configuration:
        | {
            /** Connected Publisher identity. */
            readonly source: Publisher<T | readonly T[]>;
            /** Connected reconciliation mode. */
            readonly mode: PublisherRenderMode;
            /** Connected key selector identity. */
            readonly keyBy: PublisherKeySelector<T> | undefined;
        }
        | undefined;
    /** Cached immutable snapshot. */
    #snapshot: PublisherSnapshot<T> = emptyPublisherSnapshot<T>();

    /** Creates a binding that invalidates an Angular consumer on each signal. */
    constructor(readonly onChange: () => void) {}

    /** Current immutable reconciliation snapshot. */
    get snapshot(): PublisherSnapshot<T> {
        return this.#snapshot;
    }

    /** Connects to a Publisher and updates selectors without restarting the source. */
    connect(
        source: Publisher<T | readonly T[]>,
        mode: PublisherRenderMode,
        keyBy?: PublisherKeySelector<T>
    ): void {
        const current = this.#configuration;
        if (current?.source === source && current.mode === mode) {
            if (current.keyBy !== keyBy) {
                this.#configuration = {source, mode, keyBy};
                this.#store?.setKeyBy(keyBy);
            }
            return;
        }
        this.disconnect();
        this.#configuration = {source, mode, keyBy};
        const store = new PublisherExternalStore(source, mode, keyBy);
        this.#store = store;
        const unsubscribe = store.subscribe(() => {
            if (this.#store !== store) {
                return;
            }
            this.#snapshot = store.getSnapshot();
            this.onChange();
        });
        if (this.#store !== store) {
            unsubscribe();
            return;
        }
        this.#unsubscribe = unsubscribe;
        this.#snapshot = store.getSnapshot();
    }

    /** Cancels the active subscription and resets cached state. */
    disconnect(): void {
        this.#unsubscribe?.();
        this.#unsubscribe = undefined;
        this.#store = undefined;
        this.#configuration = undefined;
        this.#snapshot = emptyPublisherSnapshot<T>();
    }
}
