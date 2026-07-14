/**
 * React Publisher runtime components and hooks.
 *
 * @packageDocumentation
 */
import {
    Fragment,
    createElement,
    useMemo,
    useSyncExternalStore,
    type ReactNode
} from "react";
import {
    createHookPublisherComponents,
    lazyJsxValue,
    type HookRendererAdapter,
    type PublisherChildProps,
    type PublisherSequenceProps,
    type UsePublisherOptions
} from "@/jsx/create-components.js";
import {PublisherExternalStore, emptyPublisherSnapshot} from "@/shared/publisher-store.js";
import type {PublisherSnapshot} from "@/shared/types.js";

/** Stable no-op external-store subscription. */
const emptySubscribe = (): (() => void) => () => undefined;
/** Stable empty snapshot accessor. */
const getEmptySnapshot = <T,>(): PublisherSnapshot<T> => emptyPublisherSnapshot<T>();

/** React adapter used by the shared hook-based runtime. */
const adapter: HookRendererAdapter<ReactNode> = {
    Fragment,
    createElement: createElement as unknown as HookRendererAdapter<ReactNode>["createElement"],
    useMemo,
    usePublisherSnapshot
};

const components = createHookPublisherComponents(adapter);

/** React component rendering a direct Publisher JSX child. */
export const PublisherChild = components.PublisherChild as (props: PublisherChildProps) => ReactNode;

/** React component rendering a mapped Publisher sequence. */
export const PublisherSequence = components.PublisherSequence as <T>(
    props: PublisherSequenceProps<T>
) => ReactNode;

/** React hook exposing reconciled Publisher values. */
export const usePublisherValues = components.usePublisherValues;

/** Compiler helper for JSX returned directly from Reactor flatMap. */
export {lazyJsxValue};

/** Options accepted by the React Publisher hook. */
export type {UsePublisherOptions};

/** Reads an optional Publisher store through React's concurrent-safe hook. */
function usePublisherSnapshot<T>(store: PublisherExternalStore<T> | undefined): PublisherSnapshot<T> {
    return useSyncExternalStore(
        store?.subscribe ?? emptySubscribe,
        store?.getSnapshot ?? getEmptySnapshot<T>,
        store?.getServerSnapshot ?? getEmptySnapshot<T>
    );
}
