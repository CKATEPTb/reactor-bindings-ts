/**
 * Renderer-independent Publisher rendering contracts.
 *
 * @packageDocumentation
 */

/** Stable identity accepted by the shared reconciliation store. */
export type PublisherKey = unknown;

/** Rendering behavior selected by JSX or a framework template adapter. */
export type PublisherRenderMode = "append" | "latest" | "snapshot";

/** Selects a stable reconciliation key from a Publisher value. */
export type PublisherKeySelector<T> = (value: T) => PublisherKey;

/** One immutable entry exposed to UI framework adapters. */
export interface PublisherEntry<T> {
    /** Framework-safe numeric identity retained across keyed updates. */
    readonly id: number;
    /** Application key or private append identity. */
    readonly key: PublisherKey;
    /** Latest value associated with the entry. */
    readonly value: T;
}

/** Cached immutable snapshot consumed by external-store integrations. */
export interface PublisherSnapshot<T> {
    /** Ordered entries visible to the renderer. */
    readonly entries: readonly PublisherEntry<T>[];
    /** Box preserving arbitrary failure values, including `undefined`. */
    readonly failure?: {
        /** Original Publisher or reconciliation failure. */
        readonly error: unknown;
    };
    /** Monotonic revision used for diagnostics and framework invalidation. */
    readonly revision: number;
}
