/** Preact JSX runtime and Publisher-aware child types. */
import type {ComponentChild, JSX as PreactJSX} from "preact";
import type {Publisher} from "reactor-core-ts";
export {Fragment, jsx, jsxs} from "preact/jsx-runtime";

/** Publisher-aware Preact JSX namespace. */
export namespace JSX {
    /** Standard Preact element. */
    export type Element = PreactJSX.Element;
    /** Preact component contract. */
    export type ElementClass = PreactJSX.ElementClass;
    /** Preact attribute property contract. */
    export type ElementAttributesProperty = PreactJSX.ElementAttributesProperty;
    /** Preact children property contract. */
    export type ElementChildrenAttribute = PreactJSX.ElementChildrenAttribute;
    /** Preact library-managed attributes. */
    export type LibraryManagedAttributes<C, P> = PreactJSX.LibraryManagedAttributes<C, P>;
    /** Preact intrinsic attributes. */
    export type IntrinsicAttributes = PreactJSX.IntrinsicAttributes;
    /** Intrinsic elements accepting Publishers as children. */
    export type IntrinsicElements = {
        [Name in keyof PreactJSX.IntrinsicElements]: Omit<PreactJSX.IntrinsicElements[Name], "children"> & {
            /** Preact children extended with Reactor Publishers. */
            readonly children?: ReactorPreactChild;
        };
    };
}

/** Recursive Preact child extended with Reactor Publishers. */
type ReactorPreactChild = ComponentChild | Publisher<unknown> | readonly ReactorPreactChild[];

declare module "reactor-core-ts" {
    /** Preact JSX overloads available to Publisher-aware TSX. */
    interface Flux<T> {
        /** Allows lazily compiled JSX as a Reactor `flatMap` result. */
        flatMap<R extends PreactJSX.Element>(
            mapper: (value: T) => R,
            concurrency?: number
        ): Flux<R>;
    }

    /** Preact JSX overloads available to Publisher-aware TSX. */
    interface Mono<T> {
        /** Allows lazily compiled JSX as a Reactor `flatMap` result. */
        flatMap<R extends PreactJSX.Element>(mapper: (value: T) => R): Mono<R>;
    }
}
