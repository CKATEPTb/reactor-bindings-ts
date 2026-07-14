/**
 * React Publisher runtime components and hooks.
 *
 * @packageDocumentation
 */
import {
    Fragment,
    createElement,
    useEffect,
    useLayoutEffect,
    useMemo,
    useSyncExternalStore,
    type ReactNode
} from "react";
import {
    createHookPublisherComponents,
    lazyJsxValue,
    type HookRendererAdapter,
    type PublisherChildProps,
    type PublisherSequenceProps
} from "@/jsx/create-components.js";
import {PublisherExternalStore, emptyPublisherSnapshot} from "@/shared/publisher-store.js";
import type {PublisherSnapshot} from "@/shared/types.js";

/** Stable no-op external-store subscription. */
const emptySubscribe = (): (() => void) => () => undefined;
/** Stable empty snapshot accessor. */
const getEmptySnapshot = <T,>(): PublisherSnapshot<T> => emptyPublisherSnapshot<T>();
/** Uses commit-synchronous layout effects in browsers without warning during SSR. */
const useCommitEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** React adapter used by the shared hook-based runtime. */
const adapter: HookRendererAdapter<ReactNode> = {
    Fragment,
    createElement: createElement as unknown as HookRendererAdapter<ReactNode>["createElement"],
    useMemo,
    useCommitEffect,
    usePublisherSnapshot
};

const components = createHookPublisherComponents(adapter);

/** React component rendering a direct Publisher JSX child. */
export const PublisherChild = components.PublisherChild as (props: PublisherChildProps) => ReactNode;

/** React component rendering a mapped Publisher sequence. */
export const PublisherSequence = components.PublisherSequence as <T>(
    props: PublisherSequenceProps<T>
) => ReactNode;

/** Compiler fast path returning ordinary children without an extra React fiber. */
export const renderPublisherChild = components.renderPublisherChild as (
    source: unknown,
    mode?: "append" | "latest",
    lazy?: boolean,
    unsupportedHost?: string
) => ReactNode;

/** Compiler fast path returning ordinary mapped values without an extra React fiber. */
export const renderPublisherSequence = components.renderPublisherSequence as <T>(
    props: PublisherSequenceProps<T>,
    unsupportedHost?: string
) => ReactNode;

/** React hook exposing reconciled Publisher values. */
export const usePublisherValues = components.usePublisherValues;

/** Compiler helper for JSX returned directly from Reactor flatMap. */
export {lazyJsxValue};

/** Options accepted by the React Publisher hook. */
export type {
    UsePublisherAppendOptions,
    UsePublisherOptions,
    UsePublisherSnapshotOptions,
    UsePublisherValues
} from "@/jsx/create-components.js";

/** Reads an optional Publisher store through React's concurrent-safe hook. */
function usePublisherSnapshot<T>(store: PublisherExternalStore<T> | undefined): PublisherSnapshot<T> {
    return useSyncExternalStore(
        store?.subscribe ?? emptySubscribe,
        store?.getSnapshot ?? getEmptySnapshot<T>,
        store?.getServerSnapshot ?? getEmptySnapshot<T>
    );
}
