import {Flux} from "reactor-core-ts";
import type {
    PublisherDirectiveItem,
    PublisherLatestPipe,
    PublisherValuesPipe
} from "reactor-bindings-ts/angular";

declare const valuesPipe: PublisherValuesPipe;
declare const latestPipe: PublisherLatestPipe;

const users = Flux.just({id: 1, name: "Ada"});
declare const directiveUser: PublisherDirectiveItem<typeof users>;
directiveUser.id.toFixed();
const userValues = valuesPipe.transform(users);
userValues[0]?.id.toFixed();
latestPipe.transform(users)?.id.toFixed();

const snapshots = Flux.just<readonly {id: number}[]>([{id: 1}]);
declare const snapshotUser: PublisherDirectiveItem<typeof snapshots, "snapshot">;
snapshotUser.id.toFixed();
declare const appendedSnapshot: PublisherDirectiveItem<typeof snapshots>;
appendedSnapshot[0]?.id.toFixed();
const snapshotValues = valuesPipe.transform(snapshots, user => user.id, "snapshot");
snapshotValues[0]?.id.toFixed();

// @ts-expect-error Snapshot mode requires an array-emitting Publisher.
valuesPipe.transform(users, user => user.id, "snapshot");
