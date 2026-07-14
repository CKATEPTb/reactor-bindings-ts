/** Combined Publisher and Preact Vite integration. */
import {preact, type PreactPluginOptions} from "@preact/preset-vite";
import type {PluginOption} from "vite";
import {publisherJsxVite} from "@/vite/publisher-jsx-vite.js";

/** Creates Publisher pre-transform and the official Preact preset. */
export function reactorPreact(options: PreactPluginOptions = {}): PluginOption[] {
    return [
        publisherJsxVite({
            runtimeModule: "reactor-bindings-ts/preact/runtime",
            directChildStrategy: "helper"
        }),
        ...preact({
            ...options,
            jsxImportSource: options.jsxImportSource ?? "reactor-bindings-ts/preact"
        })
    ];
}

export default reactorPreact;
