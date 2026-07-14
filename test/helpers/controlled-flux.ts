/** Test Publisher that exposes imperative signal methods. */
import {Flux} from "reactor-core-ts";

/** Imperative Flux test fixture. */
export interface ControlledFlux<T> {
    /** Flux under test. */
    readonly flux: Flux<T>;
    /** Number of upstream cancellations. */
    readonly cancellationCount: number;
    /** Emits one value. */
    next(value: T): void;
    /** Terminates with an error. */
    error(error: unknown): void;
    /** Completes successfully. */
    complete(): void;
}

/** Creates a cold single-subscriber controlled Flux. */
export function controlledFlux<T>(): ControlledFlux<T> {
    let nextSignal: ((value: T) => void) | undefined;
    let errorSignal: ((error: unknown) => void) | undefined;
    let completeSignal: (() => void) | undefined;
    let cancellations = 0;
    const flux = Flux.create<T>(sink => {
        nextSignal = value => sink.next(value);
        errorSignal = error => sink.error(error);
        completeSignal = () => sink.complete();
        sink.onCancel(() => {
            cancellations += 1;
        });
    });
    return {
        flux,
        get cancellationCount() {
            return cancellations;
        },
        next(value) {
            requireSignal(nextSignal, "next")(value);
        },
        error(error) {
            requireSignal(errorSignal, "error")(error);
        },
        complete() {
            requireSignal(completeSignal, "complete")();
        }
    };
}

/** Lets reactor-core-ts deliver queued async-iterable signals. */
export async function flushPublisher(): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, 0));
}

/** Returns an initialized signal callback. */
function requireSignal<T>(signal: T | undefined, name: string): T {
    if (!signal) {
        throw new Error(`Controlled Flux ${name} called before subscription`);
    }
    return signal;
}
