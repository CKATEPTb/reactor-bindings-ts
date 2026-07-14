import type {Publisher} from "reactor-core-ts";
import {describe, expect, it} from "vitest";
import {PublisherBinding} from "@/angular/publisher-binding.js";
import {controlledFlux, flushPublisher} from "@/test/helpers/controlled-flux.js";

interface Item {
    readonly id: number;
    readonly group: string;
}

describe("PublisherBinding", () => {
    it("updates key selectors without restarting the Publisher", async () => {
        const source = controlledFlux<Item>();
        const binding = new PublisherBinding<Item>(() => undefined);
        binding.connect(source.flux, "append", item => item.id);
        source.next({id: 1, group: "shared"});
        await flushPublisher();

        binding.connect(source.flux, "append", item => item.group);
        expect(source.cancellationCount).toBe(0);
        source.next({id: 2, group: "shared"});
        await flushPublisher();

        expect(binding.snapshot.entries.map(entry => entry.value.id)).toEqual([2]);
        expect(source.cancellationCount).toBe(0);
        binding.disconnect();
        expect(source.cancellationCount).toBe(1);
    });

    it("does not let a synchronous stale connect overwrite a reentrant one", async () => {
        const replacement = controlledFlux<number>();
        let switched = false;
        const binding = new PublisherBinding<number>(() => {
            if (!switched && binding.snapshot.entries[0]?.value === 1) {
                switched = true;
                binding.connect(replacement.flux, "append");
            }
        });
        binding.connect(synchronousValue(1), "append");

        expect(binding.snapshot.entries).toEqual([]);
        replacement.next(2);
        await flushPublisher();

        expect(binding.snapshot.entries.map(entry => entry.value)).toEqual([2]);
        binding.disconnect();
    });
});

/** Publisher that emits and completes before subscribe returns. */
function synchronousValue(value: number): Publisher<number> {
    return {
        subscribe(subscriber) {
            subscriber.onSubscribe({
                request() {
                    subscriber.onNext(value);
                    subscriber.onComplete();
                },
                cancel() {}
            });
        }
    };
}
