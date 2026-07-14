/** Combined Publisher, Vue SFC, and Vue JSX Vite integration. */
import vue, {type Options as VueOptions} from "@vitejs/plugin-vue";
import vueJsx, {type Options as VueJsxOptions} from "@vitejs/plugin-vue-jsx";
import type {PluginOption} from "vite";
import {publisherJsxVite} from "@/vite/publisher-jsx-vite.js";

/** Options accepted by the combined Vue integration. */
export interface ReactorVueOptions {
    /** Official Vue SFC plugin options. */
    readonly vue?: VueOptions;
    /** Official Vue JSX plugin options. */
    readonly jsx?: VueJsxOptions;
}

/** Creates Publisher JSX pre-transform plus official Vue SFC and JSX plugins. */
export function reactorVue(options: ReactorVueOptions = {}): PluginOption[] {
    return [
        publisherJsxVite({
            runtimeModule: "reactor-bindings-ts/vue/runtime",
            directChildStrategy: "helper"
        }),
        vue(options.vue),
        vueJsx(options.jsx)
    ];
}

export default reactorVue;
