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
import {
    cloneStoreValue,
    readStoreValueShape,
    type StoreValueShape
} from "@/solid/runtime/clone-store-value.js";

/** A rendered value, its reactive view, and its ownership lifecycle. */
export interface SequenceEntry<T> {
    /** Reactive accessor consumed by Solid list reconciliation. */
    readonly view: Accessor<JSX.Element>;
    /** Value identity exposed to the mapper and its authoritative array context. */
    readonly value: Accessor<T>;
    /** Latest unwrapped Publisher value used by application key selectors. */
    readonly sourceValue: Accessor<T>;
    /** Validates that a value can update this entry without changing shape. */
    validate(value: T): void;
    /** Reconciles a new value into the existing entry. */
    update(value: T): void;
    /** Updates native Array.map positional context after all entries exist. */
    updateContext(index: number, values: readonly T[]): void;
    /** Disposes the entry root and all nested subscriptions. */
    dispose(): void;
}

/** Reactive positional context supplied to authoritative snapshot mappers. */
interface SequenceRenderContext<T> {
    /** Current ordered position. */
    readonly index: number;
    /** Current authoritative values. */
    readonly values: readonly T[];
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
    render: (value: T, index: number, values: readonly T[]) => JSX.Element,
    initialIndex = 0,
    initialValues: readonly T[] = [],
    contextual = false
): SequenceEntry<T> {
    const entry = runWithOwner(owner, () => createRoot<SequenceEntry<T>>(dispose => {
        const [context, setContext] = createSignal(
            {index: initialIndex, values: initialValues},
            {equals: false}
        );
        let sourceValue = initialValue;
        const storeShape = readStoreValueShape(initialValue);
        if (storeShape) {
            const [state, setState] = createStore(cloneStoreValue(initialValue as object));
            const view = createMemo(() => {
                const current = context();
                return render(state as T, current.index, current.values);
            });
            const validate = (value: T): void => validateStoreShape(storeShape, value);
            return {
                view,
                value: () => state as T,
                sourceValue: () => sourceValue,
                validate,
                update(value) {
                    validate(value);
                    sourceValue = value;
                    setState(reconcile(cloneStoreValue(value as object), {merge: true}));
                },
                updateContext: (index, values) => updateContext(
                    setContext,
                    contextual,
                    index,
                    values
                ),
                dispose
            };
        }

        const [value, setValue] = createSignal(initialValue, {equals: false});
        const view = createMemo(() => {
            const current = context();
            return render(value(), current.index, current.values);
        });
        const validate = (nextValue: T): void => validateStoreShape(undefined, nextValue);
        return {
            view,
            value,
            sourceValue: () => sourceValue,
            validate,
            update(nextValue) {
                validate(nextValue);
                sourceValue = nextValue;
                setValue(() => nextValue);
            },
            updateContext: (index, values) => updateContext(
                setContext,
                contextual,
                index,
                values
            ),
            dispose
        };
    }));

    if (!entry) {
        throw new Error("Unable to create a Publisher entry outside its Solid owner");
    }
    return entry;
}

/** Updates snapshot mapper context only when the caller supplied it. */
function updateContext<T>(
    setContext: (value: SequenceRenderContext<T>) => unknown,
    contextual: boolean,
    index: number,
    values: readonly T[]
): void {
    if (contextual) {
        setContext({index, values});
    }
}

/** Rejects updates that Solid stores cannot safely reconcile in place. */
function validateStoreShape(expected: StoreValueShape | undefined, value: unknown): void {
    const actual = readStoreValueShape(value);
    if (actual === expected) {
        return;
    }
    throw new TypeError(
        `A keyed Publisher entry cannot change between ${expected ?? "primitive"} and ${actual ?? "primitive"} shapes`
    );
}
