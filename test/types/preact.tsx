/** @jsxImportSource reactor-bindings-ts/preact */
import type {ComponentChildren, JSX as PreactJSX} from "preact";
import {Flux} from "reactor-core-ts";

const numbers = Flux.range(0, 3);
const users = Flux.just({id: 1, name: "Ada"});
const userUpdates = (id: number) => Flux.just({id, name: "Ada"});

/** Preact compile-time examples for Publisher-aware children. */
export const preactExamples = <>
    <p>{numbers}</p>
    <p>{numbers!}</p>
    <p>{[1].map(() => numbers)}</p>
    <p>{numbers.map(() => users)}</p>
    <ul>{users.map(user => <li r-key={user.id}>{user.name}</li>)}</ul>
    <ul>{numbers.flatMap(id => <li r-key={id}>{userUpdates(id)!.map(user => user.name)}</li>)}</ul>
    <PreactBox>{numbers}</PreactBox>
    <PreactBox children={numbers}/>
</>;

/** Ordinary user component whose children are widened by LibraryManagedAttributes. */
function PreactBox(props: {readonly children?: ComponentChildren}): PreactJSX.Element {
    return <section>{props.children}</section>;
}

/** Render-function children retain their original callable contract. */
function PreactRenderProp(props: {
    readonly children: (value: number) => ComponentChildren;
}): PreactJSX.Element {
    return <>{props.children(1)}</>;
}

export const validPreactRenderProp = (
    <PreactRenderProp>{value => <span>{value}</span>}</PreactRenderProp>
);
// @ts-expect-error A Publisher is not a render function.
export const invalidPreactRenderProp = <PreactRenderProp>{numbers}</PreactRenderProp>;
