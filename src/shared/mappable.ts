/** Runtime fallback for statically ambiguous `map` expressions. */

/** Ordinary source with a callable map method. */
interface MappableValue {
    /** Applies a mapper using source-specific semantics. */
    map(mapper: MappableMapper): unknown;
}

/** Native mapper shape used by arrays and compatible source-specific values. */
type MappableMapper = (
    value: unknown,
    index: number,
    values: readonly unknown[]
) => unknown;

/**
 * Invokes an ordinary source's native `map` operation.
 *
 * @param source - Runtime value proven not to be a Publisher.
 * @param mapper - Original compiler-preserved mapper.
 * @returns Source-specific mapped result.
 */
export function mapMappable(
    source: unknown,
    mapper: MappableMapper
): unknown {
    if (!isMappable(source)) {
        throw new TypeError("Publisher JSX map source must be a Publisher or expose a map method");
    }
    return source.map(mapper);
}

/** Returns whether a value has a callable map method. */
function isMappable(value: unknown): value is MappableValue {
    const type = typeof value;
    return value !== null &&
        (type === "object" || type === "function") &&
        typeof (value as MappableValue).map === "function";
}
