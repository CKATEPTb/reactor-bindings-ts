import {createApp, h, nextTick, ref} from "vue";
import type {Publisher as ReactorPublisher, Subscriber} from "reactor-core-ts";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {Publisher} from "@/vue/publisher.js";
import {renderPublisherSequence} from "@/vue/runtime.js";
import {usePublisherValues} from "@/vue/use-publisher-values.js";
import {controlledFlux, flushPublisher} from "@/test/helpers/controlled-flux.js";

describe("Vue Publisher template component", () => {
    let container: HTMLDivElement;
    let unmount: (() => void) | undefined;

    beforeEach(() => {
        container = document.createElement("div");
    });

    afterEach(() => unmount?.());

    it("renders keyed scoped-slot entries", async () => {
        interface User {
            readonly id: number;
            readonly name: string;
        }
        const source = controlledFlux<User>();
        const app = createApp({
            render: () => h("ul", null, [h(Publisher, {
                source: source.flux,
                keyBy: (user: User) => user.id
            }, {
                default: ({value}: {value: User}) => h("li", null, value.name)
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

    it("keeps a keyed binding across parent renders with a fresh selector", async () => {
        interface User {
            readonly id: number;
            readonly name: string;
        }
        const source = controlledFlux<User>();
        const revision = ref(0);
        const app = createApp({
            render: () => h("section", null, [
                h("b", null, revision.value),
                h(Publisher, {
                    source: source.flux,
                    keyBy: (user: User) => user.id
                }, {
                    default: ({value}: {value: User}) => h("span", null, value.name)
                })
            ])
        });
        app.mount(container);
        unmount = () => app.unmount();
        source.next({id: 1, name: "Ada"});
        await flushPublisher();
        await nextTick();
        const retained = container.querySelector("span");

        revision.value += 1;
        await nextTick();

        expect(source.cancellationCount).toBe(0);
        expect(container.querySelector("span")).toBe(retained);
        expect(retained?.textContent).toBe("Ada");
    });

    it("does not invoke a callable Publisher as a Vue getter", async () => {
        const source = controlledFlux<number>();
        let getterCalls = 0;
        const callable = Object.assign(
            () => {
                getterCalls += 1;
                throw new Error("Publisher was invoked as a getter");
            },
            {
                subscribe(subscriber: Subscriber<number>) {
                    source.flux.subscribe(subscriber);
                }
            }
        ) as ReactorPublisher<number> & (() => never);
        const app = createApp({
            setup() {
                const values = usePublisherValues(callable);
                return () => h("p", null, values.value.join(","));
            }
        });
        app.mount(container);
        unmount = () => app.unmount();

        source.next(3);
        await flushPublisher();
        await nextTick();

        expect(getterCalls).toBe(0);
        expect(container.textContent).toBe("3");
    });

    it("binds Publishers returned by ordinary mapped values", async () => {
        const nested = controlledFlux<string>();
        const app = createApp({
            render: () => h("p", {}, [renderPublisherSequence({
                source: [1],
                mode: "incremental",
                render: () => nested.flux,
                fallbackRender: () => nested.flux
            })])
        });
        app.mount(container);
        unmount = () => app.unmount();

        nested.next("nested");
        await flushPublisher();
        await nextTick();

        expect(container.textContent).toBe("nested");
    });
});
