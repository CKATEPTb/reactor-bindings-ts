/** Cloning for values that Solid stores can reconcile reactively. */

/** Store-backed value shapes requiring distinct reconciliation strategies. */
export type StoreValueShape = "array" | "record";

/** Returns a store shape only when recursive cloning preserves observable fields. */
export function readStoreValueShape(value: unknown): StoreValueShape | undefined {
    const shape = readRawStoreShape(value);
    return shape && isStoreCompatible(value, new WeakSet(), new WeakSet()) ? shape : undefined;
}

/**
 * Isolates a store-backed value from later mutations by its Publisher.
 *
 * Only arrays and plain records are cloned recursively. Opaque objects keep
 * their identity because Solid stores do not reconcile their internals.
 */
export function cloneStoreValue<T extends object>(value: T): T {
    return cloneStoreNode(value, new WeakMap()) as T;
}

/** Recursively clones one Solid-store-compatible node. */
function cloneStoreNode(value: unknown, clones: WeakMap<object, object>): unknown {
    if (!isStoreNode(value)) {
        return value;
    }
    const existing = clones.get(value);
    if (existing) {
        return existing;
    }

    const clone = Array.isArray(value)
        ? new Array<unknown>(value.length)
        : Object.create(Object.getPrototypeOf(value)) as Record<string, unknown>;
    clones.set(value, clone);
    const source = value as unknown as Record<string, unknown>;
    const target = clone as unknown as Record<string, unknown>;
    for (const key of Object.keys(value)) {
        const propertyValue = cloneStoreNode(source[key], clones);
        if (key === "__proto__") {
            Object.defineProperty(target, key, {
                configurable: true,
                enumerable: true,
                value: propertyValue,
                writable: true
            });
        } else {
            target[key] = propertyValue;
        }
    }
    return clone;
}

/** Returns whether Solid can recursively wrap and reconcile a value. */
function isStoreNode(value: unknown): value is Record<string, unknown> | unknown[] {
    return readRawStoreShape(value) !== undefined;
}

/** Reads an array/plain-record shape without validating its nested descriptors. */
function readRawStoreShape(value: unknown): StoreValueShape | undefined {
    if (value === null || typeof value !== "object") {
        return undefined;
    }
    if (Array.isArray(value)) {
        return Object.getPrototypeOf(value) === Array.prototype ? "array" : undefined;
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null ? "record" : undefined;
}

/** Rejects fields that Object.keys cloning or Solid reconciliation would alter. */
function isStoreCompatible(
    value: unknown,
    active: WeakSet<object>,
    validated: WeakSet<object>
): boolean {
    if (value === null || (typeof value !== "object" && typeof value !== "function")) {
        return true;
    }
    const shape = readRawStoreShape(value);
    if (!shape) {
        return false;
    }
    const object = value as object;
    if (validated.has(object)) {
        return true;
    }
    if (active.has(object)) {
        return false;
    }
    active.add(object);
    for (const key of Reflect.ownKeys(object)) {
        if (shape === "array" && key === "length") {
            continue;
        }
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (typeof key !== "string" || !descriptor?.enumerable || !("value" in descriptor) ||
            !isStoreCompatible(descriptor.value, active, validated)) {
            active.delete(object);
            return false;
        }
    }
    active.delete(object);
    validated.add(object);
    return true;
}
