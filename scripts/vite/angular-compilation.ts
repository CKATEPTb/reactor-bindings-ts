/** Vite lifecycle integration for Angular partial compilation and declarations. */
import {spawn} from "node:child_process";
import {createRequire} from "node:module";
import {mkdir, readFile, readdir, rm, writeFile} from "node:fs/promises";
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
async function copyDeclarations(
    source: string,
    target: string,
    distRoot: string = target
): Promise<void> {
    for (const entry of await readdir(source, {withFileTypes: true})) {
        const sourcePath = path.join(source, entry.name);
        const targetPath = path.join(target, entry.name);
        if (entry.isDirectory()) {
            await copyDeclarations(sourcePath, targetPath, distRoot);
        } else if (entry.name.endsWith(".d.ts")) {
            await mkdir(path.dirname(targetPath), {recursive: true});
            const declaration = await readFile(sourcePath, "utf8");
            await writeFile(targetPath, rewriteDeclarationAliases(declaration, targetPath, distRoot));
        }
    }
}

/** Resolves the source-only alias while declarations move into their final directory. */
function rewriteDeclarationAliases(source: string, file: string, distRoot: string): string {
    const rewritten = source.replace(
        /(["'])@\/([^"']+)\1/g,
        (_match, quote: string, modulePath: string) => {
            const absoluteTarget = path.resolve(distRoot, modulePath);
            const relativeToDist = path.relative(distRoot, absoluteTarget);
            if (relativeToDist === ".." || relativeToDist.startsWith(`..${path.sep}`) ||
                path.isAbsolute(relativeToDist)) {
                throw new Error(`Declaration alias escapes dist: @/${modulePath} in ${file}`);
            }

            let relative = path.relative(path.dirname(file), absoluteTarget).replaceAll("\\", "/");
            if (!relative.startsWith(".")) {
                relative = `./${relative}`;
            }
            return `${quote}${relative}${quote}`;
        }
    );
    if (rewritten.includes('"@/') || rewritten.includes("'@/")) {
        throw new Error(`Unresolved @/ alias in declaration: ${file}`);
    }
    return rewritten;
}
