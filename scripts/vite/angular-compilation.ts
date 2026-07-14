/** Vite lifecycle integration for Angular partial compilation and declarations. */
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {copyFile, mkdir, readdir, rm} from "node:fs/promises";
import path from "node:path";
import type {Plugin} from "vite";

/** Paths used by the Angular staging build. */
export interface AngularCompilationOptions {
    /** Project root containing tsconfig.build.json and build scripts. */
    readonly root: string;
    /** Temporary Angular compiler output consumed by Vite. */
    readonly stageRoot: string;
    /** Final Vite output receiving declaration files. */
    readonly distRoot: string;
}

/** Runs Angular partial compilation and installs its declarations around Vite's JS build. */
export function angularCompilation(options: AngularCompilationOptions): Plugin {
    const {root, stageRoot, distRoot} = options;
    return {
        name: "reactor-bindings-angular-compilation",
        enforce: "pre",
        async buildStart() {
            await rm(stageRoot, {recursive: true, force: true});
            await runNode(root, resolveAngularCompiler(), ["-p", path.join(root, "tsconfig.build.json")]);
        },
        async writeBundle() {
            await copyDeclarations(stageRoot, distRoot);
            await runNode(root, path.join(root, "scripts", "rewrite-dist-aliases.mjs"));
        },
        async closeBundle() {
            await rm(stageRoot, {recursive: true, force: true});
        }
    };
}

/** Returns the Angular compiler CLI without relying on a platform-specific executable shim. */
function resolveAngularCompiler(): string {
    const require = createRequire(import.meta.url);
    const packageFile = require.resolve("@angular/compiler-cli/package.json");
    return path.join(path.dirname(packageFile), "bundles", "src", "bin", "ngc.js");
}

/** Executes one Node build helper and forwards its diagnostics to the active terminal. */
function runNode(root: string, script: string, args: readonly string[] = []): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [script, ...args], {
            cwd: root,
            stdio: "inherit"
        });
        child.once("error", reject);
        child.once("exit", code => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${path.basename(script)} exited with code ${String(code)}`));
            }
        });
    });
}

/** Copies declaration files from Angular's staging tree into Vite's output tree. */
async function copyDeclarations(source: string, target: string): Promise<void> {
    for (const entry of await readdir(source, {withFileTypes: true})) {
        const sourcePath = path.join(source, entry.name);
        const targetPath = path.join(target, entry.name);
        if (entry.isDirectory()) {
            await copyDeclarations(sourcePath, targetPath);
        } else if (entry.name.endsWith(".d.ts")) {
            await mkdir(path.dirname(targetPath), {recursive: true});
            await copyFile(sourcePath, targetPath);
        }
    }
}
