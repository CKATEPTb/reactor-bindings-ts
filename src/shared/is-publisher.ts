/**
 * Structural Publisher recognition shared by every framework adapter.
 *
 * @packageDocumentation
 */
import type {Publisher} from "reactor-core-ts";

/**
 * Returns whether a value exposes a callable Reactive Streams subscription.
 *
 * @typeParam T - Emitted value type.
 * @param value - Runtime value to inspect.
 * @returns Whether the value can be treated as a Publisher.
 */
export function isPublisher<T>(value: unknown): value is Publisher<T> {
    const type = typeof value;
    return value !== null &&
        (type === "object" || type === "function") &&
        typeof (value as Publisher<T>).subscribe === "function";
}
