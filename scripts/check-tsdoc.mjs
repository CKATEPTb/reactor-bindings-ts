/** Ensures every named TypeScript declaration in `src` has a TSDoc block. */
import {parseSync} from "@babel/core";
import {readdir, readFile} from "node:fs/promises";
import {join} from "node:path";

const DECLARATION_TYPES = new Set([
    "FunctionDeclaration",
    "ClassDeclaration",
    "TSInterfaceDeclaration",
    "TSTypeAliasDeclaration",
    "TSModuleDeclaration",
    "ClassMethod",
    "ClassPrivateMethod",
    "ClassProperty",
    "ClassPrivateProperty",
    "TSMethodSignature",
    "TSPropertySignature"
]);
const IGNORED_CHILD_KEYS = new Set([
    "loc",
    "start",
    "end",
    "leadingComments",
    "trailingComments",
    "innerComments",
    "comments",
    "tokens"
]);

/** Recursively returns all TypeScript source files below a directory. */
async function collectTypeScriptFiles(directory) {
    const entries = await readdir(directory, {withFileTypes: true});
    const files = await Promise.all(entries.map(async entry => {
        const path = join(directory, entry.name);
        return entry.isDirectory()
            ? collectTypeScriptFiles(path)
            : path.endsWith(".ts") ? [path] : [];
    }));
    return files.flat();
}

/** Returns whether a Babel node has a leading TSDoc block. */
function hasTsdoc(node) {
    return node.leadingComments?.some(comment =>
        comment.type === "CommentBlock" && comment.value.startsWith("*")
    ) ?? false;
}

/** Returns the readable identifier of a named declaration. */
function declarationName(node) {
    return node.id?.name ?? node.key?.name ?? node.key?.id?.name;
}

/** Traverses a Babel AST and records declarations without TSDoc. */
function findMissingTsdoc(node, sourceFile, missing, inheritedTsdoc = false) {
    if (!node || typeof node !== "object") {
        return;
    }
    const documented = hasTsdoc(node) || inheritedTsdoc;
    const name = declarationName(node);
    if (name && DECLARATION_TYPES.has(node.type) && !documented) {
        missing.push(`${sourceFile}:${node.loc.start.line} ${node.type} ${name}`);
    }
    const passToDeclaration = documented &&
        (node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration");
    for (const [key, value] of Object.entries(node)) {
        if (IGNORED_CHILD_KEYS.has(key)) {
            continue;
        }
        if (Array.isArray(value)) {
            for (const child of value) {
                findMissingTsdoc(child, sourceFile, missing, passToDeclaration);
            }
        } else {
            findMissingTsdoc(value, sourceFile, missing, passToDeclaration);
        }
    }
}

const missing = [];
for (const sourceFile of await collectTypeScriptFiles("src")) {
    const source = await readFile(sourceFile, "utf8");
    const ast = parseSync(source, {
        filename: sourceFile,
        parserOpts: {plugins: ["typescript", "jsx", "decorators-legacy"]},
        configFile: false,
        babelrc: false
    });
    findMissingTsdoc(ast, sourceFile, missing);
}

if (missing.length > 0) {
    throw new Error(`Missing TSDoc:\n${missing.join("\n")}`);
}

console.log("TSDoc coverage is complete");
