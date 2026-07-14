/** React JSX runtime and Publisher-aware child types. */
import type * as React from "react";
import type {Publisher} from "reactor-core-ts";
export {Fragment, jsx, jsxs} from "react/jsx-runtime";

/** Publisher-aware React JSX namespace. */
export namespace JSX {
    /** Standard React element. */
    export type Element = React.JSX.Element;
    /** React class component contract. */
    export type ElementClass = React.JSX.ElementClass;
    /** React attribute property contract. */
    export type ElementAttributesProperty = React.JSX.ElementAttributesProperty;
    /** React children property contract. */
    export type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute;
    /** React library-managed attributes. */
    export type LibraryManagedAttributes<C, P> = React.JSX.LibraryManagedAttributes<C, P>;
    /** React intrinsic attributes. */
    export type IntrinsicAttributes = React.JSX.IntrinsicAttributes;
    /** React intrinsic class attributes. */
    export type IntrinsicClassAttributes<T> = React.JSX.IntrinsicClassAttributes<T>;
    /** Intrinsic elements accepting Publishers as children. */
    export type IntrinsicElements = {
        [Name in keyof React.JSX.IntrinsicElements]: Omit<React.JSX.IntrinsicElements[Name], "children"> & {
            /** React children extended with Reactor Publishers. */
            readonly children?: ReactorReactChild;
        };
    };
}

/** Recursive React child extended with Reactor Publishers. */
type ReactorReactChild = React.ReactNode | Publisher<unknown> | readonly ReactorReactChild[];

declare module "reactor-core-ts" {
    /** React JSX overloads available to Publisher-aware TSX. */
    interface Flux<T> {
        /** Allows lazily compiled JSX as a Reactor `flatMap` result. */
        flatMap<R extends React.JSX.Element>(
            mapper: (value: T) => R,
            concurrency?: number
        ): Flux<R>;
    }

    /** React JSX overloads available to Publisher-aware TSX. */
    interface Mono<T> {
        /** Allows lazily compiled JSX as a Reactor `flatMap` result. */
        flatMap<R extends React.JSX.Element>(mapper: (value: T) => R): Mono<R>;
    }
}
