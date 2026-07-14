/** Combined Publisher and React Vite integration. */
import react, {type Options as ReactOptions} from "@vitejs/plugin-react";
import type {PluginOption} from "vite";
import {publisherJsxVite} from "@/vite/publisher-jsx-vite.js";

/** Creates Publisher pre-transform and the official React plugin. */
export function reactorReact(options: ReactOptions = {}): PluginOption[] {
    return [
        publisherJsxVite({runtimeModule: "reactor-bindings-ts/react/runtime"}),
        react({
            ...options,
            jsxImportSource: options.jsxImportSource ?? "reactor-bindings-ts/react"
        })
    ];
}

export default reactorReact;
