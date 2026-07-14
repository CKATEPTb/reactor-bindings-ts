/**
 * Preact Publisher runtime components and hooks.
 *
 * @packageDocumentation
 */
import {Fragment, createElement, type ComponentChild} from "preact";
import {useMemo} from "preact/hooks";
import {useSyncExternalStore} from "preact/compat";
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

/** Preact adapter used by the shared hook-based runtime. */
const adapter: HookRendererAdapter<ComponentChild> = {
    Fragment,
    createElement: (type, props, ...children) => createElement(
        type as preact.ComponentType<Record<string, unknown>>,
        props,
        ...(children as ComponentChild[])
    ),
    useMemo,
    usePublisherSnapshot
};

const components = createHookPublisherComponents(adapter);

/** Preact component rendering a direct Publisher JSX child. */
export const PublisherChild = components.PublisherChild as (
    props: PublisherChildProps
) => ComponentChild;

/** Preact component rendering a mapped Publisher sequence. */
export const PublisherSequence = components.PublisherSequence as <T>(
    props: PublisherSequenceProps<T>
) => ComponentChild;

/** Preact hook exposing reconciled Publisher values. */
export const usePublisherValues = components.usePublisherValues;

/** Compiler helper for JSX returned directly from Reactor flatMap. */
export {lazyJsxValue};

/** Options accepted by the Preact Publisher hook. */
export type {UsePublisherOptions};

/** Reads an optional Publisher store through Preact's concurrent-safe compatibility hook. */
function usePublisherSnapshot<T>(store: PublisherExternalStore<T> | undefined): PublisherSnapshot<T> {
    return useSyncExternalStore(
        store?.subscribe ?? emptySubscribe,
        store?.getSnapshot ?? getEmptySnapshot<T>
    );
}
