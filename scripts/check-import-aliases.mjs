/** Rejects relative module imports where the project `@/` alias is available. */
import {readdir, readFile, stat} from "node:fs/promises";
import {extname, join} from "node:path";
import ts from "typescript";

const sourceExtensions = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs"]);
const scanTargets = [
    "src",
    "test",
    "scripts",
    "test-runtime/src",
    "vitest.config.ts",
    "test-runtime/vite.config.ts"
];
const violations = [];

for (const target of scanTargets) {
    for (const file of await collectSourceFiles(target)) {
        const source = await readFile(file, "utf8");
        const sourceFile = ts.createSourceFile(
            file,
            source,
            ts.ScriptTarget.Latest,
            true,
            scriptKind(file)
        );
        visit(sourceFile, sourceFile);
    }
}

if (violations.length > 0) {
    throw new Error(`Use @/ for internal imports:\n${violations.join("\n")}`);
}

console.log("Internal imports use @/ aliases");

/** Collects supported source files from a file or directory. */
async function collectSourceFiles(target) {
    const stats = await stat(target);
    if (stats.isFile()) {
        return sourceExtensions.has(extname(target)) ? [target] : [];
    }

    const entries = await readdir(target, {withFileTypes: true});
    const nested = await Promise.all(entries.map(entry => {
        const path = join(target, entry.name);
        return entry.isDirectory() ? collectSourceFiles(path) :
            sourceExtensions.has(extname(entry.name)) ? [path] : [];
    }));
    return nested.flat();
}

/** Chooses the parser mode for a source filename. */
function scriptKind(file) {
    if (file.endsWith(".tsx")) {
        return ts.ScriptKind.TSX;
    }
    if (file.endsWith(".jsx")) {
        return ts.ScriptKind.JSX;
    }
    return file.endsWith(".js") || file.endsWith(".mjs") ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

/** Visits import-like syntax and records relative module specifiers. */
function visit(node, sourceFile) {
    const moduleSpecifier = readModuleSpecifier(node);
    if (moduleSpecifier?.text.startsWith(".")) {
        const {line, character} = sourceFile.getLineAndCharacterOfPosition(moduleSpecifier.getStart());
        violations.push(`${sourceFile.fileName}:${line + 1}:${character + 1} ${moduleSpecifier.text}`);
    }
    ts.forEachChild(node, child => visit(child, sourceFile));
}

/** Returns a string module specifier from imports, exports, and dynamic imports. */
function readModuleSpecifier(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        return node.moduleSpecifier;
    }
    if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
        const expression = node.moduleReference.expression;
        return expression && ts.isStringLiteralLike(expression) ? expression : undefined;
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) &&
        ts.isStringLiteralLike(node.argument.literal)) {
        return node.argument.literal;
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        ts.isIdentifier(node.expression) && node.expression.text === "require")) {
        const [argument] = node.arguments;
        return argument && ts.isStringLiteralLike(argument) ? argument : undefined;
    }
    return undefined;
}
