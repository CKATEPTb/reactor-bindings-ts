/** @jsxImportSource reactor-bindings-ts/vue */
import {Flux} from "reactor-core-ts";
import {Publisher, usePublisherValues} from "reactor-bindings-ts/vue";

const numbers = Flux.range(0, 3);
const users = Flux.just({id: 1, name: "Ada"});
const userUpdates = (id: number) => Flux.just({id, name: "Ada"});

/** Vue compile-time examples for Publisher-aware children. */
export const vueExamples = <>
    <p>{numbers}</p>
    <p>{numbers!}</p>
    <p>{[1].map(() => numbers)}</p>
    <p>{numbers.map(() => users)}</p>
    <ul>{users.map(user => <li r-key={user.id}>{user.name}</li>)}</ul>
    <ul>{numbers.flatMap(id => <li r-key={id}>{userUpdates(id)!.map(user => user.name)}</li>)}</ul>
</>;

/** Verifies item inference and snapshot discrimination for the Vue composable. */
export function vueComposableTypes(): void {
    const inferred = usePublisherValues(users);
    inferred.value[0]?.id.toFixed();
    const snapshots = Flux.just<readonly {id: number}[]>([{id: 1}]);
    const snapshotValues = usePublisherValues(
        snapshots,
        {mode: "snapshot"}
    );
    snapshotValues.value[0]?.id.toFixed();
    // @ts-expect-error Snapshot mode requires an array-emitting Publisher.
    usePublisherValues(numbers, {mode: "snapshot"});

    new Publisher({source: users, keyBy: user => user.id});
    new Publisher({source: snapshots, mode: "snapshot", keyBy: user => user.id});
}
