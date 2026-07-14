import {createApp, h, nextTick} from "vue";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {Publisher} from "@/vue/publisher.js";
import {controlledFlux, flushPublisher} from "@/test/helpers/controlled-flux.js";

describe("Vue Publisher template component", () => {
    let container: HTMLDivElement;
    let unmount: (() => void) | undefined;

    beforeEach(() => {
        container = document.createElement("div");
    });

    afterEach(() => unmount?.());

    it("renders keyed scoped-slot entries", async () => {
        const source = controlledFlux<{readonly id: number; readonly name: string}>();
        const app = createApp({
            render: () => h("ul", null, [h(Publisher, {
                source: source.flux,
                keyBy: user => (user as {id: number}).id
            }, {
                default: ({value}: {value: {name: string}}) => h("li", null, value.name)
            })])
        });
        app.mount(container);
        unmount = () => app.unmount();

        source.next({id: 1, name: "before"});
        await flushPublisher();
        await nextTick();
        const original = container.querySelector("li");
        source.next({id: 1, name: "after"});
        await flushPublisher();
        await nextTick();

        expect(container.querySelector("li")).toBe(original);
        expect(original?.textContent).toBe("after");
    });
});
