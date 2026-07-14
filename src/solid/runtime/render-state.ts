/** Solid reactive override state for Publisher runtime components. */
import {createSignal, type Accessor, type JSX} from "solid-js";

/** A fallback value rendered instead of Publisher sequence content. */
export interface FallbackRenderState {
    /** Discriminator for a fallback override. */
    readonly kind: "fallback";
    /** Original non-Publisher JSX value. */
    readonly value: JSX.Element;
}

/** A Publisher or render failure propagated to a Solid error boundary. */
export interface FailureRenderState {
    /** Discriminator for a failure override. */
    readonly kind: "failure";
    /** Arbitrary value reported as an error. */
    readonly error: unknown;
}

/** Optional runtime output override. */
export type RenderOverride = FallbackRenderState | FailureRenderState;

/** Operations over one reactive runtime output override. */
export interface RenderState {
    /** Current fallback or failure, when present. */
    readonly current: Accessor<RenderOverride | undefined>;
    /** Restores normal sequence rendering. */
    readonly clear: () => void;
    /** Displays an ordinary JSX fallback value. */
    readonly showFallback: (value: JSX.Element) => void;
    /** Reports a Publisher or render failure. */
    readonly reportFailure: (error: unknown) => void;
}

/** Creates the single signal used for mutually exclusive fallback and failure state. */
export function createRenderState(): RenderState {
    const [current, setCurrent] = createSignal<RenderOverride>();
    return {
        current,
        clear: () => setCurrent(undefined),
        showFallback: value => setCurrent({kind: "fallback", value}),
        reportFailure: error => setCurrent({kind: "failure", error})
    };
}
