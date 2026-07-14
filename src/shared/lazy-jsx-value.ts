/**
 * Renderer-neutral lazy JSX descriptors emitted through Reactor flatMap.
 *
 * @packageDocumentation
 */
import type {PublisherKey} from "@/shared/types.js";

/** Cross-bundle brand for compiler-generated lazy JSX. */
const LAZY_JSX_VALUE = Symbol.for("reactor-bindings-ts.lazy-jsx-value");

/** Lazy render factory and optional reconciliation key. */
export interface LazyJsxValue {
    /** Cross-bundle descriptor brand. */
    readonly [LAZY_JSX_VALUE]: true;
    /** Factory invoked by the active UI renderer. */
    readonly render: () => unknown;
    /** Optional key extracted from the root JSX element. */
    readonly key: PublisherKey | undefined;
}

/** Opaque descriptor kept outside Solid's plain-record store reconciliation. */
class LazyJsxDescriptor implements LazyJsxValue {
    /** Cross-bundle descriptor brand. */
    readonly [LAZY_JSX_VALUE] = true as const;

    /** Creates one renderer-neutral lazy JSX descriptor. */
    constructor(
        /** Factory invoked by the active UI renderer. */
        readonly render: () => unknown,
        /** Optional compiler-extracted reconciliation key. */
        readonly key: PublisherKey | undefined
    ) {}
}

/**
 * Creates a one-value iterable compatible with Reactor and Array flatMap.
 *
 * @param render - Lazy JSX factory.
 * @param key - Optional root JSX key.
 * @returns Single descriptor array.
 */
export function lazyJsxValue(render: () => unknown, key?: PublisherKey): readonly LazyJsxValue[] {
    return [new LazyJsxDescriptor(render, key)];
}

/** Returns whether a value is a compiler-generated lazy JSX descriptor. */
export function isLazyJsxValue(value: unknown): value is LazyJsxValue {
    return typeof value === "object" &&
        value !== null &&
        (value as LazyJsxValue)[LAZY_JSX_VALUE] === true &&
        typeof (value as LazyJsxValue).render === "function";
}

/** Reads a required key from a lazy JSX descriptor. */
export function lazyJsxValueKey(value: unknown): PublisherKey {
    if (!isLazyJsxValue(value) || value.key === undefined) {
        throw new TypeError("Lazy Publisher JSX value does not have a key");
    }
    return value.key;
}
