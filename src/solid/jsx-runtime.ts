/** Solid JSX child types, compiler keys, and Reactor flatMap overloads. */
import type {JSX as SolidJSX} from "solid-js";
import type {Publisher} from "reactor-core-ts";

/** Recursive Solid child extended with Reactor Publishers. */
type ReactorSolidChild = SolidJSX.Element | Publisher<unknown> | readonly ReactorSolidChild[];

/** Solid intrinsic elements with Publisher-aware children and compiler keys. */
type ReactorSolidIntrinsicElements = {
    [Name in keyof SolidJSX.IntrinsicElements]: Omit<
        SolidJSX.IntrinsicElements[Name],
        "children" | "key"
    > & {
        /** Solid children extended with Reactor Publishers. */
        readonly children?: ReactorSolidChild;
        /** Compiler-only reconciliation key. */
        readonly key?: PropertyKey;
    };
};

declare module "reactor-core-ts" {
    /** Solid JSX overloads available to Publisher-aware TSX. */
    interface Flux<T> {
        /** Allows lazily compiled JSX as a Reactor flatMap result. */
        flatMap<R extends SolidJSX.Element>(
            mapper: (value: T) => R,
            concurrency?: number
        ): Flux<R>;
    }

    /** Solid JSX overloads available to Publisher-aware TSX. */
    interface Mono<T> {
        /** Allows lazily compiled JSX as a Reactor flatMap result. */
        flatMap<R extends SolidJSX.Element>(mapper: (value: T) => R): Mono<R>;
    }
}

/** Publisher-aware Solid JSX namespace. */
export namespace JSX {
    /** Standard Solid JSX value. */
    export type Element = SolidJSX.Element;
    /** Intrinsic elements accepting Publishers and compiler keys. */
    export type IntrinsicElements = ReactorSolidIntrinsicElements;
    /** Solid component instance contract. */
    export interface ElementClass extends SolidJSX.ElementClass {}
    /** Solid component props lookup contract. */
    export interface ElementAttributesProperty extends SolidJSX.ElementAttributesProperty {}
    /** Solid children lookup contract. */
    export interface ElementChildrenAttribute extends SolidJSX.ElementChildrenAttribute {}
    /** Attributes accepted by compiler-transformed components. */
    export interface IntrinsicAttributes extends SolidJSX.IntrinsicAttributes {
        /** Stable identity used by incremental and snapshot reconciliation. */
        readonly key?: PropertyKey;
    }
}
