/** Framework-neutral Vite pre-transform for Publisher JSX. */
import {transformAsync} from "@babel/core";
import type {Plugin} from "vite";
import publisherJsxPlugin, {
    type PublisherJsxPluginOptions
} from "@/compiler/publisher-jsx-plugin.js";

/** Vite pre-transform options. */
export interface PublisherJsxViteOptions extends PublisherJsxPluginOptions {}

/** Creates a Publisher JSX pre-transform to run before a framework plugin. */
export function publisherJsxVite(options: PublisherJsxViteOptions): Plugin {
    return {
        name: "reactor-bindings-publisher-jsx",
        enforce: "pre",
        async transform(source, id) {
            const cleanId = id.replace(/\?.*$/, "").replaceAll("\\", "/");
            if (!source.includes("{") || !/\.[cm]?[jt]sx$/i.test(cleanId) || cleanId.includes("/node_modules/")) {
                return null;
            }
            const parserPlugins: Array<"jsx" | "typescript"> = ["jsx"];
            if (/\.[cm]?tsx$/i.test(cleanId)) {
                parserPlugins.push("typescript");
            }
            const result = await transformAsync(source, {
                filename: cleanId,
                sourceFileName: cleanId,
                plugins: [[publisherJsxPlugin, options]],
                parserOpts: {plugins: parserPlugins},
                sourceMaps: true,
                ast: false,
                configFile: false,
                babelrc: false
            });
            return result?.code
                ? {code: result.code, map: result.map ? JSON.stringify(result.map) : null}
                : null;
        }
    };
}
