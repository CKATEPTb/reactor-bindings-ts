/** @jsxImportSource reactor-bindings-ts/react */
import {Flux} from "reactor-core-ts";

const numbers = Flux.range(0, 3);
const users = Flux.just({id: 1, name: "Ada"});
const userUpdates = (id: number) => Flux.just({id, name: "Ada"});

/** React compile-time examples for Publisher-aware children. */
export const reactExamples = <>
    <p>{numbers}</p>
    <p>{numbers!}</p>
    <ul>{users.map(user => <li r-key={user.id}>{user.name}</li>)}</ul>
    <ul>{numbers.flatMap(id => <li r-key={id}>{userUpdates(id)!.map(user => user.name)}</li>)}</ul>
</>;
