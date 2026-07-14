import type {Publisher, Subscriber} from "reactor-core-ts";
import {describe, expect, it, vi} from "vitest";
import {PublisherExternalStore} from "@/shared/publisher-store.js";
import {controlledFlux, flushPublisher} from "@/test/helpers/controlled-flux.js";

describe("PublisherExternalStore", () => {
    it("starts on the first listener and cancels after the last", async () => {
        const source = controlledFlux<number>();
        const store = new PublisherExternalStore(source.flux, "append");
        const listener = vi.fn();
        const first = store.subscribe(listener);
        const second = store.subscribe(listener);

        source.next(1);
        await flushPublisher();
        expect(store.getSnapshot().entries.map(entry => entry.value)).toEqual([1]);
        expect(listener).toHaveBeenCalledTimes(2);

        first();
        first();
        expect(source.cancellationCount).toBe(0);
        second();
        expect(source.cancellationCount).toBe(1);
        expect(store.getSnapshot().entries).toEqual([]);
    });

    it("reconciles authoritative arrays and reports invalid snapshot values", async () => {
        const source = controlledFlux<readonly number[] | number>();
        const store = new PublisherExternalStore<number>(source.flux, "snapshot", value => value);
        const unsubscribe = store.subscribe(() => undefined);

        source.next([1, 2]);
        await flushPublisher();
        source.next([2]);
        await flushPublisher();
        expect(store.getSnapshot().entries.map(entry => entry.value)).toEqual([2]);

        source.next(3);
        await flushPublisher();
        expect(store.getSnapshot().failure?.error).toBeInstanceOf(TypeError);
        unsubscribe();
    });

    it("does not invoke a listener removed reentrantly during notification", async () => {
        const source = controlledFlux<number>();
        const store = new PublisherExternalStore(source.flux, "append");
        const secondListener = vi.fn();
        let unsubscribeSecond = (): void => undefined;
        const unsubscribeFirst = store.subscribe(() => unsubscribeSecond());
        unsubscribeSecond = store.subscribe(secondListener);

        source.next(1);
        await flushPublisher();

        expect(secondListener).not.toHaveBeenCalled();
        unsubscribeFirst();
    });

    it("ignores late signals from an earlier subscription generation", async () => {
        const source = manualPublisher<string>();
        const store = new PublisherExternalStore(source.publisher, "append");
        const unsubscribeFirst = store.subscribe(() => undefined);
        unsubscribeFirst();
        const unsubscribeSecond = store.subscribe(() => undefined);

        source.subscribers[0]?.onNext("stale");
        source.subscribers[0]?.onComplete();
        source.subscribers[1]?.onNext("fresh");
        await Promise.resolve();

        expect(store.getSnapshot().entries.map(entry => entry.value)).toEqual(["fresh"]);
        unsubscribeSecond();
    });

    it("publishes a synchronous append burst once", () => {
        const publisher: Publisher<number> = {
            subscribe(subscriber) {
                subscriber.onSubscribe({
                    request() {
                        for (let value = 0; value < 1_000; value += 1) {
                            subscriber.onNext(value);
                        }
                        subscriber.onComplete();
                    },
                    cancel() {}
                });
            }
        };
        const store = new PublisherExternalStore(publisher, "append");
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);

        expect(store.getSnapshot().entries).toHaveLength(1_000);
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it("keeps getSnapshot pure while an asynchronous burst is pending", async () => {
        const source = controlledFlux<number>();
        const store = new PublisherExternalStore(source.flux, "append");
        const listener = vi.fn();
        const unsubscribe = store.subscribe(listener);

        source.next(1);

        expect(store.getSnapshot().entries).toEqual([]);
        expect(listener).not.toHaveBeenCalled();
        await flushPublisher();
        expect(store.getSnapshot().entries.map(entry => entry.value)).toEqual([1]);
        expect(listener).toHaveBeenCalledTimes(1);
        unsubscribe();
    });

    it("preserves snapshot identity when the key selector changes", async () => {
        interface Item {
            readonly id: number;
            readonly group: number;
        }
        const first = {id: 1, group: 2};
        const second = {id: 2, group: 1};
        const source = controlledFlux<readonly Item[]>();
        const store = new PublisherExternalStore<Item>(source.flux, "snapshot", item => item.id);
        const unsubscribe = store.subscribe(() => undefined);
        source.next([first, second]);
        await flushPublisher();
        const ids = new Map(store.getSnapshot().entries.map(entry => [entry.value, entry.id]));

        store.setKeyBy(item => item.group);
        source.next([first, second]);
        await flushPublisher();

        expect(store.getSnapshot().entries.map(entry => entry.id)).toEqual([
            ids.get(first),
            ids.get(second)
        ]);
        unsubscribe();
    });

    it("keeps one selector transaction when a listener changes it reentrantly", async () => {
        interface Item {
            readonly id: number;
            readonly group: string;
        }
        const source = controlledFlux<Item>();
        const store = new PublisherExternalStore<Item>(source.flux, "append", item => item.id);
        let changeDuringRekey = false;
        let changed = false;
        const unsubscribe = store.subscribe(() => {
            if (changeDuringRekey && !changed) {
                changed = true;
                store.setKeyBy(() => "all");
            }
        });
        source.next({id: 1, group: "shared"});
        await flushPublisher();

        store.setKeyBy(item => item.group);
        changeDuringRekey = true;
        source.next({id: 2, group: "shared"});
        await flushPublisher();

        expect(store.getSnapshot().entries.map(entry => entry.value.id)).toEqual([2]);
        source.next({id: 3, group: "other"});
        await flushPublisher();
        expect(store.getSnapshot().entries.map(entry => entry.value.id)).toEqual([3]);
        unsubscribe();
    });

    it("recovers when old entries are ambiguous under a new snapshot selector", async () => {
        interface Item {
            readonly id: number;
            readonly group: string;
        }
        const first = {id: 1, group: "shared"};
        const second = {id: 2, group: "shared"};
        const source = controlledFlux<readonly Item[]>();
        const store = new PublisherExternalStore<Item>(source.flux, "snapshot", item => item.id);
        const unsubscribe = store.subscribe(() => undefined);
        source.next([first, second]);
        await flushPublisher();

        store.setKeyBy(item => item.group);
        source.next([first]);
        await flushPublisher();

        expect(store.getSnapshot().failure).toBeUndefined();
        expect(store.getSnapshot().entries.map(entry => entry.value)).toEqual([first]);
        unsubscribe();
    });

    it("does not let a removed old value block snapshot selector recovery", async () => {
        interface Item {
            readonly id: number;
        }
        const first = {id: 1};
        const removed = {id: 2};
        const source = controlledFlux<readonly Item[]>();
        const store = new PublisherExternalStore<Item>(source.flux, "snapshot", item => item.id);
        const unsubscribe = store.subscribe(() => undefined);
        source.next([first, removed]);
        await flushPublisher();

        store.setKeyBy(item => {
            if (item.id === 2) {
                throw new TypeError("removed value has no new key");
            }
            return item.id;
        });
        source.next([first]);
        await flushPublisher();

        expect(store.getSnapshot().failure).toBeUndefined();
        expect(store.getSnapshot().entries.map(entry => entry.value)).toEqual([first]);
        unsubscribe();
    });
});

/** Manually signalled Publisher retaining cancelled subscribers for late-signal tests. */
function manualPublisher<T>(): {
    readonly publisher: Publisher<T>;
    readonly subscribers: Subscriber<T>[];
} {
    const subscribers: Subscriber<T>[] = [];
    return {
        publisher: {
            subscribe(subscriber) {
                subscribers.push(subscriber);
                subscriber.onSubscribe({request() {}, cancel() {}});
            }
        },
        subscribers
    };
}
