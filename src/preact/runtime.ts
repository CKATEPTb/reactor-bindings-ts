/**
 * Preact Publisher runtime components and hooks.
 *
 * @packageDocumentation
 */
import {Fragment, createElement, type ComponentChild} from "preact";
import {useEffect, useLayoutEffect, useMemo} from "preact/hooks";
import {useSyncExternalStore} from "preact/compat";
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

/** Preact adapter used by the shared hook-based runtime. */
const adapter: HookRendererAdapter<ComponentChild> = {
    Fragment,
    createElement: (type, props, ...children) => createElement(
        type as preact.ComponentType<Record<string, unknown>>,
        props,
        ...(children as ComponentChild[])
    ),
    useMemo,
    useCommitEffect,
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

/** Compiler fast path returning ordinary children without an extra Preact component. */
export const renderPublisherChild = components.renderPublisherChild as (
    source: unknown,
    mode?: "append" | "latest",
    lazy?: boolean,
    unsupportedHost?: string
) => ComponentChild;

/** Compiler fast path returning ordinary mapped values without an extra Preact component. */
export const renderPublisherSequence = components.renderPublisherSequence as <T>(
    props: PublisherSequenceProps<T>,
    unsupportedHost?: string
) => ComponentChild;

/** Preact hook exposing reconciled Publisher values. */
export const usePublisherValues = components.usePublisherValues;

/** Compiler helper for JSX returned directly from Reactor flatMap. */
export {lazyJsxValue};

/** Options accepted by the Preact Publisher hook. */
export type {
    UsePublisherAppendOptions,
    UsePublisherOptions,
    UsePublisherSnapshotOptions,
    UsePublisherValues
} from "@/jsx/create-components.js";

/** Reads an optional Publisher store through Preact's concurrent-safe compatibility hook. */
function usePublisherSnapshot<T>(store: PublisherExternalStore<T> | undefined): PublisherSnapshot<T> {
    return useSyncExternalStore(
        store?.subscribe ?? emptySubscribe,
        store?.getSnapshot ?? getEmptySnapshot<T>
    );
}
