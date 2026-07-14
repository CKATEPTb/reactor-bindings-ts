/** Type-level extraction of values from structurally variant Publishers. */
import type {Publisher, Subscriber} from "reactor-core-ts";

/** First parameter of a Publisher's most concrete subscribe overload. */
type FirstSubscribeParameter<Source extends Publisher<unknown>> =
    NonNullable<Parameters<Source["subscribe"]>[0]>;

/** Extracts the emitted value without relying on invariant Publisher inference. */
export type PublisherValue<Source extends Publisher<unknown>> =
    Source extends AsyncIterable<infer T>
        ? T
        : FirstSubscribeParameter<Source> extends (value: infer T, ...args: never[]) => unknown
            ? T
            : FirstSubscribeParameter<Source> extends Subscriber<unknown>
                ? Parameters<FirstSubscribeParameter<Source>["onNext"]>[0]
                : never;

/** Extracts one item from an array-emitting Publisher. */
export type PublisherSnapshotItem<Source extends Publisher<unknown>> =
    PublisherValue<Source> extends readonly (infer T)[] ? T : never;
