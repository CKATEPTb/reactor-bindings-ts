/** Production library build orchestrated by Vite. */
import {readFile} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {defineConfig} from "vite";
import {angularCompilation} from "./scripts/vite/angular-compilation.js";

const root = path.dirname(fileURLToPath(import.meta.url));
const stageRoot = path.join(root, "node_modules", ".cache", "reactor-bindings-ts", "build");
const distRoot = path.join(root, "dist");
const packageJson = JSON.parse(
    await readFile(path.join(root, "package.json"), "utf8")
) as PackageManifest;
const input = Object.fromEntries(
    collectExportTargets(packageJson.exports)
        .filter(target => target.startsWith("./dist/") && target.endsWith(".js"))
        .map(target => {
            const name = target.slice("./dist/".length, -".js".length);
            return [name, path.join(stageRoot, `${name}.js`)];
        })
);

export default defineConfig({
    plugins: [angularCompilation({root, stageRoot, distRoot})],
    resolve: {
        alias: [{find: /^@\//, replacement: `${stageRoot.replaceAll("\\", "/")}/`}]
    },
    build: {
        target: "es2022",
        outDir: distRoot,
        emptyOutDir: true,
        copyPublicDir: false,
        minify: false,
        sourcemap: false,
        reportCompressedSize: false,
        rolldownOptions: {
            input,
            external: isExternalDependency,
            preserveEntrySignatures: "strict",
            output: {
                format: "es",
                preserveModules: true,
                preserveModulesRoot: stageRoot,
                entryFileNames: "[name].js",
                chunkFileNames: "[name].js"
            }
        }
    }
});

/** Minimal package fields required to derive Vite's public entry points. */
interface PackageManifest {
    /** Conditional npm export map. */
    readonly exports: unknown;
}

/** Keeps package dependencies external while allowing Vite to resolve staged internal modules. */
function isExternalDependency(id: string): boolean {
    return !id.startsWith("\0") && !id.startsWith(".") &&
        !path.isAbsolute(id) && !id.startsWith("@/");
}

/** Flattens conditional export objects into their string targets. */
function collectExportTargets(value: unknown): string[] {
    if (typeof value === "string") {
        return [value];
    }
    if (!value || typeof value !== "object") {
        return [];
    }
    return Object.values(value).flatMap(collectExportTargets);
}
