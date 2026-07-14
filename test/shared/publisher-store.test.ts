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
});
