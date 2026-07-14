import {act, createElement, type ReactNode} from "react";
import {createRoot, type Root} from "react-dom/client";
import {afterEach, beforeEach, describe, expect, it} from "vitest";
import {PublisherChild, PublisherSequence, usePublisherValues} from "@/react/runtime.js";
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
});
