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
    /** Identity of the only subscription allowed to mutate this store. */
    #activeSubscription: object | undefined;
    /** Selector used by future reconciliation operations. */
    #keyBy: PublisherKeySelector<T> | undefined;
    /** Selector already reflected by incremental entries. */
    #appliedKeyBy: PublisherKeySelector<T> | undefined;
    /** Signals accumulated until the current synchronous/microtask burst ends. */
    #pending: Array<T | readonly T[]> = [];
    /** Subscription whose pending flush already has a queued microtask. */
    #scheduledFor: object | undefined;

    /** Creates a store for one source and immutable render configuration. */
    constructor(
        readonly source: Publisher<T | readonly T[]>,
        readonly mode: PublisherRenderMode,
        keyBy?: PublisherKeySelector<T>
    ) {
        this.#keyBy = keyBy;
        this.#appliedKeyBy = keyBy;
    }

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

    /** Updates a selector without restarting a hot or expensive Publisher. */
    setKeyBy(keyBy?: PublisherKeySelector<T>): void {
        this.#keyBy = keyBy;
    }

    /** Starts a fresh guarded upstream subscription. */
    #start(): void {
        const subscription = {};
        this.#activeSubscription = subscription;
        this.#pending = [];
        this.#scheduledFor = undefined;
        this.#appliedKeyBy = this.#keyBy;
        this.#sequence.clear();
        const disposable = subscribeToPublisher(this.source, {
            next: value => {
                if (this.#activeSubscription !== subscription) {
                    return;
                }
                this.#pending.push(value);
                this.#scheduleFlush(subscription);
            },
            error: error => {
                if (this.#activeSubscription === subscription) {
                    this.#flushPending(subscription);
                    if (this.#activeSubscription !== subscription) {
                        return;
                    }
                    this.#activeSubscription = undefined;
                    this.#disposable = undefined;
                    this.#sequence.fail(error);
                }
            },
            complete: () => {
                if (this.#activeSubscription === subscription) {
                    this.#flushPending(subscription);
                    if (this.#activeSubscription !== subscription) {
                        return;
                    }
                    this.#activeSubscription = undefined;
                    this.#disposable = undefined;
                }
            }
        });
        if (this.#activeSubscription !== subscription || this.#subscriberCount === 0) {
            disposable?.dispose();
            return;
        }
        this.#disposable = disposable;
    }

    /** Cancels upstream and prevents late callbacks from mutating state. */
    #stop(): void {
        this.#activeSubscription = undefined;
        this.#pending = [];
        this.#scheduledFor = undefined;
        this.#disposable?.dispose();
        this.#disposable = undefined;
        this.#sequence.clear();
    }

    /** Coalesces one synchronous Publisher burst into one reconciliation publish. */
    #scheduleFlush(subscription: object): void {
        if (this.#scheduledFor === subscription) {
            return;
        }
        this.#scheduledFor = subscription;
        queueMicrotask(() => {
            if (this.#scheduledFor === subscription) {
                this.#scheduledFor = undefined;
                this.#flushPending(subscription);
            }
        });
    }

    /** Applies all pending signals while preserving their append/upsert order. */
    #flushPending(subscription: object | undefined): void {
        if (!subscription || this.#activeSubscription !== subscription || this.#pending.length === 0) {
            return;
        }
        const pending = this.#pending;
        this.#pending = [];
        if (this.#scheduledFor === subscription) {
            this.#scheduledFor = undefined;
        }
        try {
            if (this.mode === "snapshot") {
                const value = pending.at(-1);
                if (!Array.isArray(value)) {
                    throw new TypeError("Snapshot Publisher must emit an array");
                }
                const keyBy = this.#keyBy;
                this.#sequence.applySnapshot(value, keyBy, this.#appliedKeyBy !== keyBy);
                if (this.#activeSubscription !== subscription) {
                    return;
                }
                this.#appliedKeyBy = keyBy;
            } else if (this.mode === "latest") {
                this.#sequence.latest(pending.at(-1) as T);
            } else {
                const keyBy = this.#keyBy;
                if (this.#appliedKeyBy !== keyBy) {
                    this.#sequence.rekeyAppend(keyBy);
                    if (this.#activeSubscription !== subscription) {
                        return;
                    }
                    this.#appliedKeyBy = keyBy;
                }
                this.#sequence.appendMany(pending as readonly T[], keyBy);
            }
        } catch (error) {
            this.#sequence.fail(error);
        }
    }
}

/** Returns the typed shared empty snapshot. */
export function emptyPublisherSnapshot<T>(): PublisherSnapshot<T> {
    return EMPTY_SNAPSHOT;
}
