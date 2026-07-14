/** Backward-friendly Solid profile for the shared Publisher JSX compiler. */
import type {PluginObj} from "@babel/core";
import {
    publisherJsxPlugin as sharedPublisherJsxPlugin,
    type PublisherJsxPluginOptions,
    type PublisherPluginState
} from "@/compiler/index.js";

/** Optional overrides accepted by the Solid compiler profile. */
export interface SolidPublisherJsxPluginOptions {
    /** Compiler-generated runtime import module. */
    readonly runtimeModule?: string;
}

/** Creates the shared compiler with Solid's key and runtime defaults. */
export function publisherJsxPlugin(
    api: unknown,
    options: SolidPublisherJsxPluginOptions = {}
): PluginObj<PublisherPluginState> {
    const sharedOptions: PublisherJsxPluginOptions = {
        runtimeModule: options.runtimeModule ?? "reactor-bindings-ts/solid/runtime",
        fallbackKeyMode: "strip",
        directChildStrategy: "component"
    };
    return sharedPublisherJsxPlugin(api, sharedOptions);
}

export default publisherJsxPlugin;
