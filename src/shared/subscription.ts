/**
 * Safe Reactive Streams subscription boundary.
 *
 * @packageDocumentation
 */
import {Flux, type Disposable, type Publisher} from "reactor-core-ts";

/** Subscriber callbacks accepted by the shared subscription boundary. */
export interface PublisherCallbacks<T> {
    /** Handles one value. */
    readonly next: (value: T) => void;
    /** Handles terminal failure. */
    readonly error: (error: unknown) => void;
    /** Handles successful completion. */
    readonly complete?: () => void;
}

/**
 * Subscribes while converting synchronous subscribe failures to `error`.
 *
 * @typeParam T - Emitted value type.
 * @param source - Publisher to subscribe to.
 * @param callbacks - Signal callbacks.
 * @returns Disposable subscription or `undefined` after a thrown failure.
 */
export function subscribeToPublisher<T>(
    source: Publisher<T>,
    callbacks: PublisherCallbacks<T>
): Disposable | undefined {
    try {
        return Flux.from(source).subscribe(callbacks.next, callbacks.error, callbacks.complete);
    } catch (error) {
        callbacks.error(error);
        return undefined;
    }
}
