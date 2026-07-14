/** Rewrites the source-only `@/` alias to relative paths in published files. */
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const distRoot = path.join(root, "dist");
let rewrittenFiles = 0;

for (const file of walk(distRoot)) {
    if (!file.endsWith(".js") && !file.endsWith(".d.ts")) {
        continue;
    }

    const source = fs.readFileSync(file, "utf8");
    const rewritten = source.replace(/(["'])@\/([^"']+)\1/g, (_match, quote, target) => {
        const absoluteTarget = path.resolve(distRoot, target);
        if (!isInsideDist(absoluteTarget)) {
            throw new Error(`Alias escapes dist: @/${target} in ${file}`);
        }

        let relative = path.relative(path.dirname(file), absoluteTarget).replace(/\\/g, "/");
        if (!relative.startsWith(".")) {
            relative = `./${relative}`;
        }
        return `${quote}${relative}${quote}`;
    });

    if (rewritten.includes('"@/') || rewritten.includes("'@/")) {
        throw new Error(`Unresolved @/ alias in ${file}`);
    }
    if (rewritten !== source) {
        fs.writeFileSync(file, rewritten);
        rewrittenFiles++;
    }
}

console.log(`Rewrote @/ aliases in ${rewrittenFiles} build files`);

/** Returns whether a resolved alias target stays inside the output directory. */
function isInsideDist(target) {
    const relative = path.relative(distRoot, target);
    return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Recursively returns every file below a directory. */
function walk(directory) {
    if (!fs.existsSync(directory)) {
        return [];
    }

    return fs.readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        const absolute = path.join(directory, entry.name);
        return entry.isDirectory() ? walk(absolute) : [absolute];
    });
}
