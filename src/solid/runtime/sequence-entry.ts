/** Individually owned and reactively updateable Solid sequence entries. */
import {
    createMemo,
    createRoot,
    createSignal,
    runWithOwner,
    type Accessor,
    type JSX,
    type Owner
} from "solid-js";
import {createStore, reconcile} from "solid-js/store";

/** A rendered value, its reactive view, and its ownership lifecycle. */
export interface SequenceEntry<T> {
    /** Reactive accessor consumed by Solid list reconciliation. */
    readonly view: Accessor<JSX.Element>;
    /** Validates that a value can update this entry without changing shape. */
    validate(value: T): void;
    /** Reconciles a new value into the existing entry. */
    update(value: T): void;
    /** Disposes the entry root and all nested subscriptions. */
    dispose(): void;
}

/**
 * Creates one independently owned Solid sequence entry.
 *
 * Plain records and arrays use a Solid store; primitives and opaque objects
 * use an always-invalidating signal.
 */
export function createSequenceEntry<T>(
    owner: Owner,
    initialValue: T,
    render: (value: T) => JSX.Element
): SequenceEntry<T> {
    const entry = runWithOwner(owner, () => createRoot<SequenceEntry<T>>(dispose => {
        const storeShape = readStoreShape(initialValue);
        if (storeShape) {
            const [state, setState] = createStore(initialValue as object);
            const view = createMemo(() => render(state as T));
            const validate = (value: T): void => validateStoreShape(storeShape, value);
            return {
                view,
                validate,
                update(value) {
                    validate(value);
                    setState(reconcile(value as object, {merge: true}));
                },
                dispose
            };
        }

        const [value, setValue] = createSignal(initialValue, {equals: false});
        const view = createMemo(() => render(value()));
        const validate = (nextValue: T): void => validateStoreShape(undefined, nextValue);
        return {
            view,
            validate,
            update(nextValue) {
                validate(nextValue);
                setValue(() => nextValue);
            },
            dispose
        };
    }));

    if (!entry) {
        throw new Error("Unable to create a Publisher entry outside its Solid owner");
    }
    return entry;
}

/** Store-backed value shapes requiring distinct reconciliation strategies. */
type StoreShape = "array" | "record";

/** Returns the store shape of a safely reconcilable value. */
function readStoreShape(value: unknown): StoreShape | undefined {
    if (value === null || typeof value !== "object") {
        return undefined;
    }
    if (Array.isArray(value)) {
        return "array";
    }
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null
        ? "record"
        : undefined;
}

/** Rejects updates that Solid stores cannot safely reconcile in place. */
function validateStoreShape(expected: StoreShape | undefined, value: unknown): void {
    const actual = readStoreShape(value);
    if (actual === expected) {
        return;
    }
    throw new TypeError(
        `A keyed Publisher entry cannot change between ${expected ?? "primitive"} and ${actual ?? "primitive"} shapes`
    );
}
