import {createElement, render} from "preact";
import {act} from "preact/test-utils";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {PublisherChild} from "@/preact/runtime.js";
import {controlledFlux, flushPublisher} from "@/test/helpers/controlled-flux.js";

describe("Preact Publisher runtime", () => {
    let container: HTMLDivElement;

    beforeEach(() => {
        container = document.createElement("div");
    });

    afterEach(() => {
        render(null, container);
    });

    it("renders and disposes a direct Publisher", async () => {
        const source = controlledFlux<number>();
        act(() => render(createElement("p", null,
            "Count is ",
            createElement(PublisherChild, {source: source.flux})
        ), container));

        source.next(7);
        await flushPublisher();
        act(() => undefined);
        expect(container.textContent).toBe("Count is 7");

        render(null, container);
        expect(source.cancellationCount).toBe(1);
    });
});
