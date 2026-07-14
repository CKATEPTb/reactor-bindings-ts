/** Vue JSX runtime and Publisher-aware child types. */
import type {VNodeChild} from "vue";
import type {JSX as VueJSX} from "vue/jsx-runtime";
import type {Publisher} from "reactor-core-ts";
export {Fragment, jsx, jsxs} from "vue/jsx-runtime";

/** Publisher-aware Vue JSX namespace. */
export namespace JSX {
    /** Standard Vue virtual node. */
    export type Element = VueJSX.Element;
    /** Vue component instance contract. */
    export type ElementClass = VueJSX.ElementClass;
    /** Vue attribute property contract. */
    export type ElementAttributesProperty = VueJSX.ElementAttributesProperty;
    /** Vue intrinsic attributes. */
    export type IntrinsicAttributes = VueJSX.IntrinsicAttributes;
    /** Intrinsic elements accepting Publishers as children. */
    export type IntrinsicElements = {
        [Name in keyof VueJSX.IntrinsicElements]: Omit<VueJSX.IntrinsicElements[Name], "children"> & {
            /** Vue children extended with Reactor Publishers. */
            readonly children?: ReactorVueChild;
        };
    };
}

/** Recursive Vue child extended with Reactor Publishers. */
type ReactorVueChild = VNodeChild | Publisher<unknown> | readonly ReactorVueChild[];

declare module "reactor-core-ts" {
    /** Vue JSX overloads available to Publisher-aware TSX. */
    interface Flux<T> {
        /** Allows lazily compiled JSX as a Reactor `flatMap` result. */
        flatMap<R extends VueJSX.Element>(
            mapper: (value: T) => R,
            concurrency?: number
        ): Flux<R>;
    }

    /** Vue JSX overloads available to Publisher-aware TSX. */
    interface Mono<T> {
        /** Allows lazily compiled JSX as a Reactor `flatMap` result. */
        flatMap<R extends VueJSX.Element>(mapper: (value: T) => R): Mono<R>;
    }
}
