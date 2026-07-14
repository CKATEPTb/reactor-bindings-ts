import {act, createElement, useLayoutEffect, type ReactNode} from "react";
import {createRoot, type Root} from "react-dom/client";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {
    PublisherChild,
    PublisherSequence,
    lazyJsxValue,
    renderPublisherChild,
    renderPublisherSequence,
    usePublisherValues
} from "@/react/runtime.js";
import type {PublisherSequenceProps} from "@/jsx/create-components.js";
import {controlledFlux, flushPublisher} from "@/test/helpers/controlled-flux.js";

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT: boolean})
    .IS_REACT_ACT_ENVIRONMENT = true;

describe("React Publisher runtime", () => {
    let container: HTMLDivElement;
    let root: Root;

    beforeEach(() => {
        container = document.createElement("div");
        root = createRoot(container);
    });

    afterEach(async () => {
        await act(async () => root.unmount());
    });

    it("renders a direct Publisher without map", async () => {
        const source = controlledFlux<number>();
        await act(async () => root.render(createElement(
            "p",
            null,
            "Count is ",
            createElement(PublisherChild, {source: source.flux})
        )));

        source.next(1);
        source.next(2);
        await act(flushPublisher);

        expect(container.textContent).toBe("Count is 12");
    });

    it("updates a keyed entry while retaining its DOM node", async () => {
        interface User {
            readonly id: number;
            readonly name: string;
        }
        const source = controlledFlux<User>();
        const UserPublisherSequence = PublisherSequence as (
            props: PublisherSequenceProps<User>
        ) => ReactNode;
        await act(async () => root.render(createElement(UserPublisherSequence, {
            source: source.flux,
            mode: "incremental",
            keyBy: user => user.id,
            render: user => createElement("li", null, user.name),
            fallbackRender: user => user
        })));

        source.next({id: 1, name: "before"});
        await act(flushPublisher);
        const original = container.querySelector("li");
        source.next({id: 1, name: "after"});
        await act(flushPublisher);

        expect(container.querySelector("li")).toBe(original);
        expect(original?.textContent).toBe("after");
    });

    it("exposes the shared reconciliation engine through the hook", async () => {
        const source = controlledFlux<number>();
        function Values(): ReactNode {
            return createElement("p", null, usePublisherValues(source.flux).join(","));
        }
        await act(async () => root.render(createElement(Values)));

        source.next(3);
        source.next(4);
        await act(flushPublisher);

        expect(container.textContent).toBe("3,4");
    });

    it("keeps a keyed hot binding across parent renders with a fresh selector", async () => {
        interface User {
            readonly id: number;
            readonly name: string;
        }
        const source = controlledFlux<User>();
        const UserPublisherSequence = PublisherSequence as (
            props: PublisherSequenceProps<User>
        ) => ReactNode;
        const renderView = (label: string): ReactNode => createElement("section", null,
            createElement("b", null, label),
            createElement(UserPublisherSequence, {
                source: source.flux,
                mode: "incremental",
                keyBy: user => user.id,
                render: user => createElement("span", null, user.name),
                fallbackRender: user => user
            })
        );
        await act(async () => root.render(renderView("first")));
        source.next({id: 1, name: "Ada"});
        await act(flushPublisher);
        const retained = container.querySelector("span");

        await act(async () => root.render(renderView("second")));

        expect(source.cancellationCount).toBe(0);
        expect(container.querySelector("span")).toBe(retained);
        expect(retained?.textContent).toBe("Ada");
        source.next({id: 1, name: "Lovelace"});
        await act(flushPublisher);
        expect(container.querySelector("span")).toBe(retained);
        expect(retained?.textContent).toBe("Lovelace");
    });

    it("passes authoritative index and array context to snapshot renderers", async () => {
        const source = controlledFlux<readonly number[]>();
        const NumberPublisherSequence = PublisherSequence as (
            props: PublisherSequenceProps<number>
        ) => ReactNode;
        await act(async () => root.render(createElement(NumberPublisherSequence, {
            source: source.flux,
            mode: "snapshot",
            render: (value, index, values) => createElement(
                "span",
                null,
                `${index}:${values.length}:${value}`
            ),
            fallbackRender: value => value,
            contextual: true
        })));

        source.next([4, 5]);
        await act(flushPublisher);

        expect(container.textContent).toBe("0:2:41:2:5");
    });

    it("returns ordinary text directly for text-only host elements", () => {
        expect(renderPublisherChild("hello", "append", false, "textarea")).toBe("hello");
        const source = controlledFlux<string>();
        expect(() => renderPublisherChild(source.flux, "append", false, "textarea"))
            .toThrow("Publisher JSX children are not supported inside <textarea>");
    });

    it("maps ordinary sequences without a component and guards mapped Publishers", async () => {
        const props: PublisherSequenceProps<number> = {
            source: [1, 2],
            mode: "incremental",
            render: value => createElement("li", null, value),
            fallbackRender: value => createElement("li", null, value as number)
        };
        await act(async () => root.render(createElement(
            "ul",
            null,
            renderPublisherSequence(props)
        )));
        expect(container.textContent).toBe("12");

        const source = controlledFlux<number>();
        expect(() => renderPublisherSequence({...props, source: source.flux}, "option"))
            .toThrow("Publisher JSX children are not supported inside <option>");

        expect(() => renderPublisherSequence({
            ...props,
            source: [1],
            fallbackRender: () => source.flux
        }, "option")).toThrow(
            "Publisher JSX children are not supported inside <option>"
        );
    });

    it("binds Publishers returned by ordinary and Publisher mappers", async () => {
        const nested = controlledFlux<string>();
        const outer = controlledFlux<number>();
        const props: PublisherSequenceProps<number> = {
            source: [1],
            mode: "incremental",
            render: () => nested.flux,
            fallbackRender: () => nested.flux
        };
        await act(async () => root.render(createElement(
            "p",
            null,
            renderPublisherSequence(props)
        )));
        nested.next("ordinary");
        await act(flushPublisher);
        expect(container.textContent).toBe("ordinary");

        await act(async () => root.render(createElement(
            "p",
            null,
            renderPublisherSequence({...props, source: outer.flux})
        )));
        outer.next(1);
        await act(flushPublisher);
        nested.next("publisher");
        await act(flushPublisher);
        expect(container.textContent).toBe("publisher");
    });

    it("applies a changed key selector before layout-time emissions flush", async () => {
        interface Item {
            readonly oldKey: string;
            readonly nextKey: string;
            readonly label: string;
        }
        const source = controlledFlux<Item>();
        const ItemSequence = PublisherSequence as (
            props: PublisherSequenceProps<Item>
        ) => ReactNode;
        const first = (item: Item): string => item.oldKey;
        const next = (item: Item): string => item.nextKey;
        function EmitInLayout({item}: {readonly item?: Item}): null {
            useLayoutEffect(() => {
                if (item) {
                    source.next(item);
                }
            }, [item]);
            return null;
        }
        const view = (
            keyBy: (item: Item) => string,
            item?: Item
        ): ReactNode => createElement(
            "div",
            null,
            createElement(ItemSequence, {
                source: source.flux,
                mode: "incremental",
                keyBy,
                render: value => createElement("span", null, value.label),
                fallbackRender: value => value
            }),
            createElement(EmitInLayout, item ? {item} : {})
        );
        await act(async () => root.render(view(first)));
        source.next({oldKey: "a", nextKey: "x", label: "a"});
        await act(flushPublisher);

        await act(async () => root.render(view(next, {
            oldKey: "b",
            nextKey: "x",
            label: "b"
        })));
        await act(flushPublisher);

        expect(container.querySelectorAll("span")).toHaveLength(1);
        expect(container.textContent).toBe("b");
    });

    it("binds Publishers nested in ordinary arrays", async () => {
        const source = controlledFlux<number>();
        function NestedPublisher(): ReactNode {
            return createElement("p", null, renderPublisherChild(["value:", source.flux]));
        }
        await act(async () => root.render(createElement(NestedPublisher)));

        source.next(7);
        await act(flushPublisher);

        expect(container.textContent).toBe("value:7");
    });

    it("rejects Publishers nested in arrays inside text-only hosts", () => {
        const source = controlledFlux<string>();

        expect(() => renderPublisherChild(["value:", source.flux], "append", false, "title"))
            .toThrow("Publisher JSX children are not supported inside <title>");
    });

    it("preserves ordinary keyed children beside a nested Publisher", async () => {
        const source = controlledFlux<number>();
        const view = (reverse: boolean): ReactNode => {
            const first = createElement("span", {key: "first", "data-id": "first"}, "first");
            const second = createElement("span", {key: "second", "data-id": "second"}, "second");
            return createElement(
                "div",
                null,
                renderPublisherChild(reverse
                    ? [second, source.flux, first]
                    : [first, source.flux, second])
            );
        };
        await act(async () => root.render(view(false)));
        const firstNode = container.querySelector('[data-id="first"]');
        const secondNode = container.querySelector('[data-id="second"]');

        await act(async () => root.render(view(true)));

        expect(container.querySelector('[data-id="first"]')).toBe(firstNode);
        expect(container.querySelector('[data-id="second"]')).toBe(secondNode);
    });

    it("preserves native VNode keys while materializing an ordinary lazy array", async () => {
        const item = (id: string) => lazyJsxValue(() => createElement(
            "span",
            {key: id, "data-id": id},
            id
        ))[0]!;
        const first = item("first");
        const second = item("second");
        const view = (reverse: boolean): ReactNode => createElement(
            "div",
            null,
            renderPublisherChild(reverse ? [second, first] : [first, second], "append", true)
        );
        await act(async () => root.render(view(false)));
        const firstNode = container.querySelector('[data-id="first"]');
        const secondNode = container.querySelector('[data-id="second"]');

        await act(async () => root.render(view(true)));

        expect(container.querySelector('[data-id="first"]')).toBe(firstNode);
        expect(container.querySelector('[data-id="second"]')).toBe(secondNode);
    });
});
