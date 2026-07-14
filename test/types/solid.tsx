/** @jsxImportSource reactor-bindings-ts/solid */
import {Flux} from "reactor-core-ts";

const numbers = Flux.range(0, 3);
const users = Flux.just({id: 1, name: "Ada"});
const userUpdates = (id: number) => Flux.just({id, name: "Ada"});

/** Solid compile-time examples for every Publisher JSX form. */
export const solidExamples = <>
    <p>{numbers}</p>
    <p>{numbers!}</p>
    <p>{[1].map(() => numbers)}</p>
    <p>{numbers.map(() => users)}</p>
    <ul>{users.map(user => <li r-key={user.id}>{user.name}</li>)}</ul>
    <ul>{numbers.flatMap(id => <li r-key={id}>{userUpdates(id)!.map(user => user.name)}</li>)}</ul>
</>;

// @ts-expect-error Solid reconciliation uses the compiler-only r-key attribute.
const unsupportedSolidKey = <li key="unsupported" />;
