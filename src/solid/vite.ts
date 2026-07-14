/** Combined Publisher and Solid Vite integration. */
import solidPlugin, {type Options as SolidPluginOptions} from "vite-plugin-solid";
import type {PluginOption} from "vite";
import {publisherJsxVite} from "@/vite/publisher-jsx-vite.js";

/** Options accepted by the combined Solid integration. */
export interface ReactorSolidOptions extends Omit<Partial<SolidPluginOptions>, "babel"> {
    /** Advanced override for compiler-generated runtime imports. */
    readonly runtimeModule?: string;
    /** Babel configuration forwarded to the official Solid plugin. */
    readonly babel?: SolidPluginOptions["babel"];
}

/** Creates the Publisher pre-transform followed by the official Solid plugin. */
export function reactorSolid(options: ReactorSolidOptions = {}): PluginOption[] {
    const {runtimeModule = "reactor-bindings-ts/solid/runtime", ...solidOptions} = options;
    return [
        publisherJsxVite({
            runtimeModule,
            fallbackKeyMode: "strip",
            directChildStrategy: "component"
        }),
        solidPlugin(solidOptions as Partial<SolidPluginOptions>)
    ];
}

export default reactorSolid;
