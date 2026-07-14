/** @jsxImportSource reactor-bindings-ts/react */
import type * as React from "react";
import {Flux, type Publisher} from "reactor-core-ts";
import {usePublisherValues} from "reactor-bindings-ts/react";

const numbers = Flux.range(0, 3);
const users = Flux.just({id: 1, name: "Ada"});
const userUpdates = (id: number) => Flux.just({id, name: "Ada"});

/** React compile-time examples for Publisher-aware children. */
export const reactExamples = <>
    <p>{numbers}</p>
    <p>{numbers!}</p>
    <p>{[1].map(() => numbers)}</p>
    <p>{numbers.map(() => users)}</p>
    <ul>{users.map(user => <li r-key={user.id}>{user.name}</li>)}</ul>
    <ul>{numbers.flatMap(id => <li r-key={id}>{userUpdates(id)!.map(user => user.name)}</li>)}</ul>
    <ReactBox>{numbers}</ReactBox>
    <ReactBox children={numbers}/>
</>;

/** Ordinary user component whose children are widened by LibraryManagedAttributes. */
function ReactBox(props: {readonly children?: React.ReactNode}): React.JSX.Element {
    return <section>{props.children}</section>;
}

/** Verifies item inference and snapshot discrimination for the React hook. */
export function reactHookTypes(): void {
    const inferred = usePublisherValues(users);
    inferred[0]?.id.toFixed();
    const snapshots = Flux.just<readonly {id: number}[]>([{id: 1}]);
    const snapshotValues = usePublisherValues(snapshots, {mode: "snapshot"});
    snapshotValues[0]?.id.toFixed();
    const structural: Publisher<{id: number}> = users;
    usePublisherValues(structural)[0]?.id.toFixed();
    // @ts-expect-error Snapshot mode requires an array-emitting Publisher.
    usePublisherValues(numbers, {mode: "snapshot"});
}

/** Render-function children must not be widened to arbitrary nodes or Publishers. */
function ReactRenderProp(props: {readonly children: (value: number) => React.ReactNode}): React.JSX.Element {
    return <>{props.children(1)}</>;
}

export const validReactRenderProp = <ReactRenderProp>{value => <span>{value}</span>}</ReactRenderProp>;
// @ts-expect-error A Publisher is not a render function.
export const invalidReactRenderProp = <ReactRenderProp>{numbers}</ReactRenderProp>;
