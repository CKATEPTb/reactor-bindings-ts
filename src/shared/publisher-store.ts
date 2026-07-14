/**
 * Lifecycle-aware external store backed by one Publisher subscription.
 *
 * @packageDocumentation
 */
import type {Disposable, Publisher} from "reactor-core-ts";
import {subscribeToPublisher} from "@/shared/subscription.js";
import {PublisherSequenceStore} from "@/shared/sequence-store.js";
import type {
    PublisherKeySelector,
    PublisherRenderMode,
    PublisherSnapshot
} from "@/shared/types.js";

/** Empty server snapshot shared by every framework adapter. */
const EMPTY_SNAPSHOT: PublisherSnapshot<never> = {entries: [], revision: 0};

/** External-store wrapper that starts on first listener and stops on last. */
export class PublisherExternalStore<T> {
    /** Reconciliation state. */
    readonly #sequence = new PublisherSequenceStore<T>();
    /** Active external-store subscriptions, including duplicate callbacks. */
    #subscriberCount = 0;
    /** Current upstream subscription. */
    #disposable: Disposable | undefined;
    /** Whether upstream callbacks still belong to this subscription. */
    #active = false;

    /** Creates a store for one source and immutable render configuration. */
    constructor(
        readonly source: Publisher<T | readonly T[]>,
        readonly mode: PublisherRenderMode,
        readonly keyBy?: PublisherKeySelector<T>
    ) {}

    /** Stable client snapshot accessor. */
    readonly getSnapshot = (): PublisherSnapshot<T> => this.#sequence.getSnapshot();

    /** Stable empty server snapshot accessor. */
    readonly getServerSnapshot = (): PublisherSnapshot<T> => EMPTY_SNAPSHOT;

    /** Starts or joins the Publisher-backed external store. */
    readonly subscribe = (listener: () => void): (() => void) => {
        let subscribed = true;
        const unsubscribeSequence = this.#sequence.subscribe(() => {
            if (subscribed) {
                listener();
            }
        });
        this.#subscriberCount += 1;
        if (this.#subscriberCount === 1) {
            this.#start();
        }
        return () => {
            if (!subscribed) {
                return;
            }
            subscribed = false;
            unsubscribeSequence();
            this.#subscriberCount -= 1;
            if (this.#subscriberCount === 0) {
                this.#stop();
            }
        };
    };

    /** Starts a fresh guarded upstream subscription. */
    #start(): void {
        this.#sequence.clear();
        this.#active = true;
        const disposable = subscribeToPublisher(this.source, {
            next: value => {
                if (!this.#active) {
                    return;
                }
                try {
                    if (this.mode === "snapshot") {
                        if (!Array.isArray(value)) {
                            throw new TypeError("Snapshot Publisher must emit an array");
                        }
                        this.#sequence.applySnapshot(value, this.keyBy);
                    } else if (this.mode === "latest") {
                        this.#sequence.latest(value as T);
                    } else {
                        this.#sequence.append(value as T, this.keyBy);
                    }
                } catch (error) {
                    this.#sequence.fail(error);
                }
            },
            error: error => {
                if (this.#active) {
                    this.#active = false;
                    this.#sequence.fail(error);
                }
            },
            complete: () => {
                this.#active = false;
            }
        });
        if (!this.#active || this.#subscriberCount === 0) {
            disposable?.dispose();
            return;
        }
        this.#disposable = disposable;
    }

    /** Cancels upstream and prevents late callbacks from mutating state. */
    #stop(): void {
        this.#active = false;
        this.#disposable?.dispose();
        this.#disposable = undefined;
        this.#sequence.clear();
    }
}

/** Returns the typed shared empty snapshot. */
export function emptyPublisherSnapshot<T>(): PublisherSnapshot<T> {
    return EMPTY_SNAPSHOT;
}
