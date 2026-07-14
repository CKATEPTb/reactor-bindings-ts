/** @jsxImportSource reactor-bindings-ts/solid */
import {createSignal, type JSX, type Setter} from "solid-js";
import {render} from "solid-js/web";
import {Flux, Sinks, type Mono} from "reactor-core-ts";
import {afterEach, describe, expect, it} from "vitest";
import {PublisherSequence} from "@/solid/runtime/publisher-sequence.js";

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

    it("binds Publishers nested in ordinary arrays", async () => {
        const sink = Sinks.many().multicast().onBackpressureBuffer<number>();
        const host = mount(() => <p>{["value:", sink.asFlux()]}</p>);

        sink.emitNext(7);
        await flushPublisher();

        expect(host.textContent).toBe("value:7");
    });

    it("binds Publishers returned by ordinary and Publisher mappers", async () => {
        const nested = Sinks.many().multicast().onBackpressureBuffer<string>();
        const outer = Sinks.many().multicast().onBackpressureBuffer<number>();
        const ordinaryHost = mount(() => <p>{[1].map(() => nested.asFlux())}</p>);
        const publisherHost = mount(() => (
            <p>{outer.asFlux().map(() => nested.asFlux())}</p>
        ));

        outer.emitNext(1);
        await flushPublisher();
        nested.emitNext("nested");
        await flushPublisher();

        expect(ordinaryHost.textContent).toBe("nested");
        expect(publisherHost.textContent).toBe("nested");
    });

    it("preserves native array mapper context after an ordinary reorder", () => {
        let setValues!: Setter<readonly string[]>;
        const host = mount(() => {
            const [values, updateValues] = createSignal<readonly string[]>(["a", "b"]);
            setValues = updateValues;
            return <ul>{values().map((value, index, items) => (
                <li>{index}:{items.length}:{value}</li>
            ))}</ul>;
        });

        setValues(["b", "a"]);

        expect([...host.querySelectorAll("li")].map(item => item.textContent))
            .toEqual(["0:2:b", "1:2:a"]);
    });

    it("preserves an assigned native flatMap from an ambiguous array parameter", () => {
        const view = (values: readonly number[]): JSX.Element => {
            const items = values.flatMap(value => <li>{value}</li>);
            return <ul>{items}</ul>;
        };

        const host = mount(() => view([1, 2]));

        expect([...host.querySelectorAll("li")].map(item => item.textContent)).toEqual(["1", "2"]);
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

    it("updates a mutated record re-emitted by the same reference", async () => {
        const sink = Sinks.many().multicast().onBackpressureBuffer<{
            id: number;
            name: string;
            details: {status: string};
        }>();
        const user = {
            id: 1,
            name: "before",
            details: {status: "offline"}
        };
        const host = mount(() => (
            <ul>{sink.asFlux().map(value => (
                <li r-key={value.id}>{value.name}: {value.details.status}</li>
            ))}</ul>
        ));

        sink.emitNext(user);
        await flushPublisher();
        const original = host.querySelector("li");
        user.name = "after";
        user.details.status = "online";
        sink.emitNext(user);
        await flushPublisher();

        expect(host.querySelector("li")).toBe(original);
        expect(original?.textContent).toBe("after: online");
    });

    it("preserves symbol fields by using a signal for non-store-safe records", async () => {
        const status = Symbol("status");
        const sink = Sinks.many().multicast().onBackpressureBuffer<{
            id: number;
            [status]: string;
        }>();
        const value = {id: 1, [status]: "before"};
        const host = mount(() => (
            <ul>{sink.asFlux().map(item => <li r-key={item.id}>{item[status]}</li>)}</ul>
        ));

        sink.emitNext(value);
        await flushPublisher();
        value[status] = "after";
        sink.emitNext(value);
        await flushPublisher();

        expect(host.querySelector("li")?.textContent).toBe("after");
    });

    it("updates mutable opaque children by using a signal-backed entry", async () => {
        const sink = Sinks.many().multicast().onBackpressureBuffer<{
            id: number;
            updatedAt: Date;
        }>();
        const value = {id: 1, updatedAt: new Date(Date.UTC(2025, 0, 1))};
        const host = mount(() => (
            <ul>{sink.asFlux().map(item => (
                <li r-key={item.id}>{item.updatedAt.getUTCFullYear()}</li>
            ))}</ul>
        ));

        sink.emitNext(value);
        await flushPublisher();
        value.updatedAt.setUTCFullYear(2026);
        sink.emitNext(value);
        await flushPublisher();

        expect(host.querySelector("li")?.textContent).toBe("2026");
    });

    it("updates cyclic records through the safe signal fallback", async () => {
        interface CyclicRecord {
            readonly id: number;
            name: string;
            self: CyclicRecord;
        }
        const value = (name: string): CyclicRecord => {
            const record = {id: 1, name} as CyclicRecord;
            record.self = record;
            return record;
        };
        const sink = Sinks.many().multicast().onBackpressureBuffer<CyclicRecord>();
        const host = mount(() => (
            <ul>{sink.asFlux().map(item => (
                <li r-key={item.id}>{item.name}:{String(item.self === item)}</li>
            ))}</ul>
        ));

        sink.emitNext(value("before"));
        await flushPublisher();
        sink.emitNext(value("after"));
        await flushPublisher();

        expect(host.querySelector("li")?.textContent).toBe("after:true");
    });

    it("rekeys incremental entries when a reactive selector changes", async () => {
        interface RekeyedItem {
            readonly oldKey: string;
            readonly nextKey: string;
            readonly label: string;
        }
        const sink = Sinks.many().multicast().onBackpressureBuffer<RekeyedItem>();
        const source = sink.asFlux();
        const oldKey = (item: RekeyedItem): string => item.oldKey;
        const nextKey = (item: RekeyedItem): string => item.nextKey;
        let setKeyBy!: Setter<(item: RekeyedItem) => string>;
        const host = mount(() => {
            const [keyBy, updateKeyBy] = createSignal(oldKey);
            setKeyBy = updateKeyBy;
            return (
                <PublisherSequence<RekeyedItem>
                    source={source}
                    mode="incremental"
                    keyBy={keyBy()}
                    render={item => <span>{item.label}</span>}
                    fallbackRender={item => item as JSX.Element}
                />
            );
        });
        sink.emitNext({oldKey: "a", nextKey: "x", label: "a"});
        await flushPublisher();

        setKeyBy(() => nextKey);
        sink.emitNext({oldKey: "b", nextKey: "x", label: "b"});
        await flushPublisher();

        expect(host.querySelectorAll("span")).toHaveLength(1);
        expect(host.textContent).toBe("b");
    });

    it("retains snapshot entries when a reactive selector changes", async () => {
        interface SnapshotItem {
            readonly oldKey: string;
            readonly nextKey: string;
            readonly label: string;
        }
        const sink = Sinks.many().multicast().onBackpressureBuffer<readonly SnapshotItem[]>();
        const source = sink.asFlux();
        const oldKey = (item: SnapshotItem): string => item.oldKey;
        const nextKey = (item: SnapshotItem): string => item.nextKey;
        let setKeyBy!: Setter<(item: SnapshotItem) => string>;
        const host = mount(() => {
            const [keyBy, updateKeyBy] = createSignal(oldKey);
            setKeyBy = updateKeyBy;
            return (
                <PublisherSequence<SnapshotItem>
                    source={source}
                    mode="snapshot"
                    keyBy={keyBy()}
                    render={item => <span>{item.label}</span>}
                    fallbackRender={item => item as JSX.Element}
                />
            );
        });
        sink.emitNext([
            {oldKey: "a", nextKey: "x", label: "a"},
            {oldKey: "b", nextKey: "y", label: "b"}
        ]);
        await flushPublisher();
        const [first, second] = [...host.querySelectorAll("span")];

        setKeyBy(() => nextKey);
        sink.emitNext([
            {oldKey: "c", nextKey: "y", label: "B"},
            {oldKey: "d", nextKey: "x", label: "A"}
        ]);
        await flushPublisher();

        const reordered = [...host.querySelectorAll("span")];
        expect(reordered).toEqual([second, first]);
        expect(reordered.map(item => item.textContent)).toEqual(["B", "A"]);
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

    it("uses the rendered value identities in snapshot array context", async () => {
        const sink = Sinks.many().multicast().onBackpressureBuffer<readonly User[]>();
        const host = mount(() => (
            <ul>{sink.asFlux().map(list => list.map((user, index, values) => (
                <li r-key={user.id}>
                    {values[index]!.id}:{String(values[index] === user)}:{values.indexOf(user)}
                </li>
            )))}</ul>
        ));

        sink.emitNext([{id: 1, name: "Ada"}]);
        await flushPublisher();

        expect(host.querySelector("li")?.textContent).toBe("1:true:0");
    });

    it("updates function-expression arguments after snapshot reordering", async () => {
        const sink = Sinks.many().multicast().onBackpressureBuffer<readonly User[]>();
        const first = {id: 1, name: "one"};
            const second = {id: 2, name: "two"};
            const host = mount(() => (
                <ul>{sink.asFlux().map(list => list.map(function (user) {
                return <li r-key={user.id}>{arguments[1]}:{arguments[2].length}</li>;
            }))}</ul>
        ));
        sink.emitNext([first, second]);
        await flushPublisher();

        expect([...host.querySelectorAll("li")].map(item => item.textContent))
            .toEqual(["0:2", "1:2"]);

        sink.emitNext([second, first]);
        await flushPublisher();

        expect([...host.querySelectorAll("li")].map(item => item.textContent))
            .toEqual(["0:2", "1:2"]);
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
