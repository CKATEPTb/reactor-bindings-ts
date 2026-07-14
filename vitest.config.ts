/** Vitest configuration shared by runtime and compiler tests. */
import {fileURLToPath} from "node:url";
import {defineConfig} from "vitest/config";
import reactorSolid from "reactor-bindings-ts/solid/vite";

const sourceRoot = fileURLToPath(new URL("./src", import.meta.url));
const testRoot = fileURLToPath(new URL("./test", import.meta.url));

export default defineConfig({
    plugins: [reactorSolid()],
    resolve: {
        alias: [
            {find: "@/test", replacement: testRoot},
            {find: "@", replacement: sourceRoot},
            {find: "reactor-bindings-ts/solid/runtime", replacement: fileURLToPath(
                new URL("./src/solid/runtime/index.ts", import.meta.url)
            )}
        ]
    },
    test: {
        environment: "jsdom",
        pool: "threads",
        restoreMocks: true
    }
});
