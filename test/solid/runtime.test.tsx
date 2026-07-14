/** @jsxImportSource reactor-bindings-ts/solid */
import {createSignal, type JSX, type Setter} from "solid-js";
import {render} from "solid-js/web";
import {Flux, Sinks, type Mono} from "reactor-core-ts";
import {afterEach, describe, expect, it} from "vitest";

interface User {
    readonly id: number;
    readonly name: string;
}

const mounted: Array<() => void> = [];

afterEach(() => {
    for (const dispose of mounted.splice(0)) {
        dispose();
    }
    document.body.replaceChildren();
});

describe("Solid Publisher runtime", () => {
    it("appends direct values and updates one latest slot", async () => {
        const appendSink = Sinks.many().multicast().onBackpressureBuffer<string>();
        const latestSink = Sinks.many().multicast().onBackpressureBuffer<string>();
        const host = mount(() => (
            <div>
                <span data-mode="append">{appendSink.asFlux()}</span>
                <span data-mode="latest">{latestSink.asFlux()!}</span>
            </div>
        ));

        appendSink.emitNext("A");
        appendSink.emitNext("B");
        latestSink.emitNext("A");
        latestSink.emitNext("B");
        await flushPublisher();

        expect(host.querySelector('[data-mode="append"]')?.textContent).toBe("AB");
        expect(host.querySelector('[data-mode="latest"]')?.textContent).toBe("B");
    });

    it("updates a keyed record without replacing its DOM node", async () => {
        const sink = Sinks.many().multicast().onBackpressureBuffer<User>();
        const host = mount(() => (
            <ul>{sink.asFlux().map(user => <li r-key={user.id}>{user.name}</li>)}</ul>
        ));

        sink.emitNext({id: 1, name: "before"});
        await flushPublisher();
        const original = host.querySelector("li");
        sink.emitNext({id: 1, name: "after"});
        await flushPublisher();

        expect(host.querySelector("li")).toBe(original);
        expect(original?.textContent).toBe("after");
    });

    it("does not write compiler-only keys to ordinary Solid DOM", () => {
        const host = mount(() => (
            <ul>{[{id: 1, name: "ordinary"}].map(user => (
            <li r-key={user.id}>{user.name}</li>
            ))}</ul>
        ));

        expect(host.querySelector("li")?.hasAttribute("key")).toBe(false);
    });

    it("keeps the outer JSX when its nested Publisher is empty", async () => {
        const host = mount(() => (
            <ul>
                {Flux.range(0, 10).flatMap(value => (
                    <li>{Flux.range(0, value)}</li>
                ))}
            </ul>
        ));
        await flushPublisher();

        const texts = [...host.querySelectorAll("li")].map(element => element.textContent);
        expect(texts).toEqual([
            "", "0", "01", "012", "0123",
            "01234", "012345", "0123456", "01234567", "012345678"
        ]);
    });

    it("renders inclusive nested ranges when count is value plus one", async () => {
        const host = mount(() => (
            <ul>
                {Flux.range(0, 10).flatMap(value => (
                    <li>{Flux.range(0, value + 1)}</li>
                ))}
            </ul>
        ));
        await flushPublisher();

        const texts = [...host.querySelectorAll("li")].map(element => element.textContent);
        expect(texts).toHaveLength(10);
        expect(texts[0]).toBe("0");
        expect(texts[9]).toBe("0123456789");
    });

    it("replaces a keyed lazy flatMap value without duplicating its root", async () => {
        interface OnlineUser {
            readonly id: number;
            readonly updates: ReturnType<typeof firstSink.asFlux>;
        }
        const outerSink = Sinks.many().multicast().onBackpressureBuffer<OnlineUser>();
        const firstSink = Sinks.many().multicast().onBackpressureBuffer<string>();
        const secondSink = Sinks.many().multicast().onBackpressureBuffer<string>();
        const host = mount(() => (
            <ul>
                {outerSink.asFlux().flatMap(user => (
            <li r-key={user.id}>{user.updates!}</li>
                ))}
            </ul>
        ));

        outerSink.emitNext({id: 1, updates: firstSink.asFlux()});
        await flushPublisher();
        firstSink.emitNext("first");
        await flushPublisher();
        expect(host.querySelector("li")?.textContent).toBe("first");

        outerSink.emitNext({id: 1, updates: secondSink.asFlux()});
        await flushPublisher();
        secondSink.emitNext("second");
        await flushPublisher();

        expect(host.querySelectorAll("li")).toHaveLength(1);
        expect(host.querySelector("li")?.textContent).toBe("second");
    });

    it("deletes and reorders authoritative snapshot entries", async () => {
        let setSnapshot!: Setter<Mono<User[]>>;
        const host = mount(() => {
            const [snapshot, setCurrentSnapshot] = createSignal<Mono<User[]>>(collected([
                {id: 1, name: "one"},
                {id: 2, name: "two"}
            ]));
            setSnapshot = setCurrentSnapshot;
            return (
                <ul>{snapshot().map(list =>
            list.map(user => <li r-key={user.id}>{user.name}</li>)
                )}</ul>
            );
        });
        await flushPublisher();
        const retained = host.querySelectorAll("li")[1];

        setSnapshot(() => collected([{id: 2, name: "updated"}]));
        await flushPublisher();

        expect(host.querySelectorAll("li")).toHaveLength(1);
        expect(host.querySelector("li")).toBe(retained);
        expect(retained?.textContent).toBe("updated");
    });

    it("cancels nested Publishers when the Solid owner is disposed", async () => {
        let cancellations = 0;
        const nested = Flux.never<number>().doOnCancel(() => {
            cancellations += 1;
        });
        const host = document.createElement("div");
        document.body.append(host);
        const dispose = render(() => (
            <ul>{Flux.just(1).flatMap(() => <li>{nested}</li>)}</ul>
        ), host);
        await flushPublisher();

        dispose();

        expect(cancellations).toBe(1);
    });
});

/** Creates a completing authoritative snapshot Publisher. */
function collected(values: readonly User[]): Mono<User[]> {
    return Flux.fromArray(values).collectList();
}

/** Mounts one Solid view and retains its disposer for test cleanup. */
function mount(view: () => JSX.Element): HTMLElement {
    const host = document.createElement("div");
    document.body.append(host);
    mounted.push(render(view, host));
    return host;
}

/** Lets Reactor and Solid deliver queued signals. */
async function flushPublisher(): Promise<void> {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
}
