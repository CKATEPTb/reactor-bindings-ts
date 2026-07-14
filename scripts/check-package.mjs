/** Validates the npm tarball manifest without creating an archive. */
import {exec} from "node:child_process";
import {readFile} from "node:fs/promises";
import {promisify} from "node:util";

const execAsync = promisify(exec);
const {stdout} = await execAsync(
    "npm pack --dry-run --json --ignore-scripts",
    {encoding: "utf8"}
);
const [manifest] = JSON.parse(stdout);

if (!manifest) {
    throw new Error("npm pack did not return a package manifest");
}

const packagedFiles = new Set(manifest.files.map(file => file.path));
const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const legacyIdentifiers = [
    ["reactor", "ui", "ts"].join("-"),
    ["reactor", "ui", "publisher-jsx"].join("-"),
    `${["react", "ui", "ts"].join("-")}/`
];

if (manifest.name !== packageJson.name) {
    throw new Error(`Packed ${manifest.name}, expected ${packageJson.name}`);
}
if (packageJson.license !== "LGPL-3.0-only") {
    throw new Error(`Expected LGPL-3.0-only, received ${packageJson.license}`);
}
const [licenseNotice, licenseDocument] = await Promise.all([
    readFile("LICENSE", "utf8"),
    readFile("LICENSE.md", "utf8")
]);
if (!licenseNotice.includes("LGPL-3.0-only") || !licenseNotice.includes("LICENSE.md")) {
    throw new Error("LICENSE must identify LGPL-3.0-only and point to LICENSE.md");
}
if (!licenseDocument.startsWith("GNU LESSER GENERAL PUBLIC LICENSE") ||
    !licenseDocument.includes("Version 3, 29 June 2007")) {
    throw new Error("LICENSE.md does not contain the LGPL version 3 text");
}
const requiredFiles = [
    "LICENSE",
    "LICENSE.md",
    "README.md",
    "package.json",
    "dist/index.js",
    "dist/index.d.ts",
    "dist/compiler/index.js",
    "dist/solid/runtime/index.js",
    "dist/react/runtime.js",
    "dist/preact/runtime.js",
    "dist/vue/runtime.js",
    "dist/angular/index.js"
];

for (const file of requiredFiles) {
    if (!packagedFiles.has(file)) {
        throw new Error(`Required package file is missing: ${file}`);
    }
}

for (const target of collectExportTargets(packageJson.exports)) {
    const file = target.replace(/^\.\//, "");
    if (!packagedFiles.has(file)) {
        throw new Error(`Export target is missing from the package: ${file}`);
    }
}

for (const file of packagedFiles) {
    const checksBuildAlias = file.startsWith("dist/") &&
        (file.endsWith(".js") || file.endsWith(".d.ts"));
    if (checksBuildAlias || isTextPackageFile(file)) {
        const source = await readFile(file, "utf8");
        if (checksBuildAlias && (source.includes('"@/') || source.includes("'@/"))) {
            throw new Error(`Unresolved @/ alias in package file: ${file}`);
        }
        const legacyIdentifier = legacyIdentifiers.find(identifier => source.includes(identifier));
        if (legacyIdentifier) {
            throw new Error(`Legacy identifier ${legacyIdentifier} in package file: ${file}`);
        }
    }
}

const angularDirective = await readFile("dist/angular/publisher.directive.js", "utf8");
if (!angularDirective.includes("ɵɵngDeclareDirective")) {
    throw new Error("Angular directive is missing partial-compilation metadata");
}

const forbiddenPrefixes = ["src/", "test/", ".github/", "scripts/"];
for (const file of packagedFiles) {
    if (forbiddenPrefixes.some(prefix => file.startsWith(prefix))) {
        throw new Error(`Development file leaked into the package: ${file}`);
    }
}

console.log(
    `${manifest.name}@${manifest.version}: ${manifest.entryCount} files, ${manifest.size} packed bytes`
);

/** Returns every file target in a nested package exports map. */
function collectExportTargets(value) {
    if (typeof value === "string") {
        return [value];
    }
    if (!value || typeof value !== "object") {
        return [];
    }
    return Object.values(value).flatMap(collectExportTargets);
}

/** Returns whether a packaged file can contain source-level identifiers. */
function isTextPackageFile(file) {
    return file === "README.md" || file === "package.json" ||
        file.startsWith("dist/") && [".js", ".ts", ".map", ".json"].some(extension =>
            file.endsWith(extension)
        );
}
