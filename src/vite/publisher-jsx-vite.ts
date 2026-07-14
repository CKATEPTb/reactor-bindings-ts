/** Framework-neutral Vite pre-transform for Publisher JSX. */
import {transformAsync} from "@babel/core";
import type {Plugin} from "vite";
import publisherJsxPlugin, {
    type PublisherJsxPluginOptions
} from "@/compiler/publisher-jsx-plugin.js";

const JSX_MODULE_PATTERN = /\.[cm]?[jt]sx$/i;
const TYPESCRIPT_JSX_MODULE_PATTERN = /\.[cm]?tsx$/i;
const JSX_OPENING_PATTERN = /<(?:>|[$_\p{ID_Start}][$_\-\p{ID_Continue}\u200C\u200D.:-]*(?:\s|\/?>))/u;

/** Vite pre-transform options. */
export interface PublisherJsxViteOptions extends PublisherJsxPluginOptions {}

/** Creates a Publisher JSX pre-transform to run before a framework plugin. */
export function publisherJsxVite(options: PublisherJsxViteOptions): Plugin {
    return {
        name: "reactor-bindings-publisher-jsx",
        enforce: "pre",
        async transform(source, id) {
            const cleanId = id.replace(/\?.*$/, "").replaceAll("\\", "/");
            if (
                !JSX_MODULE_PATTERN.test(cleanId) ||
                cleanId.includes("/node_modules/") ||
                !source.includes("{") ||
                !JSX_OPENING_PATTERN.test(source)
            ) {
                return null;
            }
            const parserPlugins: Array<"decorators-legacy" | "jsx" | "typescript"> = [
                "decorators-legacy",
                "jsx"
            ];
            if (TYPESCRIPT_JSX_MODULE_PATTERN.test(cleanId)) {
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
                ? {
                    code: result.code,
                    map: result.map
                        ? {
                            version: result.map.version,
                            names: result.map.names,
                            sources: result.map.sources,
                            sourcesContent: result.map.sourcesContent ?? [],
                            mappings: result.map.mappings
                        }
                        : null
                }
                : null;
        }
    };
}
