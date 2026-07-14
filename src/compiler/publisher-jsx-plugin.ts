/** Shared Babel transform for React, Preact, and Vue JSX. */
import type {PluginObj} from "@babel/core";
import * as t from "@babel/types";
import {
    isDefinitelyArrayAtPath,
    isDefinitelyNonPublisher,
    isDefinitelyNonPublisherAtPath
} from "@/compiler/definite-non-publisher.js";
import {getFunctionOutput, readMapExpression, unwrapExpression} from "@/compiler/expression.js";
import {readJsxFlatMapExpression} from "@/compiler/jsx-flat-map.js";
import {stripLatestAssertions} from "@/compiler/latest-assertion.js";
import {
    prepareFallbackMapper,
    prepareKeylessFallbackMapper,
    mapperHasRootKey,
    isSnapshotArgumentsOwner,
    markSnapshotArgumentsOwner,
    prepareJsxFlatMapMapper,
    prepareRenderMapper,
    prepareSnapshotRenderMapper,
    readNestedMapExpression,
    snapshotMapperHasPrelude
} from "@/compiler/render-mapper.js";
import {
    ensureLazyJsxValueImport,
    ensurePublisherChildHelperImport,
    ensurePublisherChildImport,
    ensurePublisherSequenceHelperImport,
    ensurePublisherSequenceImport,
    isInjectedRuntimeElement,
    type PublisherPluginState
} from "@/compiler/runtime-import.js";
import {
    createPublisherChildCall,
    createPublisherChildElement,
    createPublisherSequenceCall,
    createPublisherSequenceElement
} from "@/compiler/runtime-elements.js";

/** Babel plugin options. */
export interface PublisherJsxPluginOptions {
    /** Framework runtime module injected into transformed files. */
    readonly runtimeModule: string;
    /** Whether ordinary fallback JSX keys remain native or compiler-only. */
    readonly fallbackKeyMode?: "native" | "strip";
    /** Uses a zero-component ordinary-value path when the target runtime supports it. */
    readonly directChildStrategy?: "component" | "helper";
}

/** Babel state retained while compiler runtime imports are injected. */
export type {PublisherPluginState} from "@/compiler/runtime-import.js";

/** Creates the shared Publisher JSX transform. */
export default function publisherJsxPlugin(
    _api: unknown,
    options: PublisherJsxPluginOptions
): PluginObj<PublisherPluginState> {
    if (!options.runtimeModule) {
        throw new TypeError("Publisher JSX compiler requires a runtimeModule option");
    }
    const lazyAssignedBindings = new WeakSet<t.VariableDeclarator>();
    return {
        name: "reactor-bindings-publisher-jsx",
        visitor: {
            JSXExpressionContainer(path, state) {
                if (path.parentPath.isJSXAttribute() &&
                    !t.isJSXIdentifier(path.parentPath.node.name, {name: "children"})) {
                    return;
                }
                const original = t.isExpression(path.node.expression) ? path.node.expression : undefined;
                const latest = original ? stripLatestAssertions(original) : undefined;
                const expression = unwrapExpression(latest?.expression ?? path.node.expression);
                if (isInjectedRuntimeElement(expression, state)) {
                    return;
                }
                const outerMap = readMapExpression(expression);
                const nested = outerMap ? readNestedMapExpression(outerMap.mapper) : undefined;
                const mustStripMapKey = options.fallbackKeyMode === "strip" && outerMap !== undefined && (
                    mapperHasRootKey(outerMap.mapper) ||
                    (nested !== undefined && mapperHasRootKey(nested.mapper))
                );
                if (
                    latest?.marked !== true &&
                    (isSnapshotMapperScalar(expression, path) ||
                        isDefinitelyNonPublisherAtPath(expression, path) ||
                        (outerMap && (
                            isDefinitelyNonPublisher(outerMap.source) ||
                            isDefinitelyArrayAtPath(outerMap.source, path)
                        ) &&
                            isDefinitelyNonPublisher(getFunctionOutput(outerMap.mapper)) &&
                            !mustStripMapKey))
                ) {
                    return;
                }
                if (!outerMap) {
                    if (!t.isExpression(expression)) {
                        return;
                    }
                    const flatMap = readJsxFlatMapExpression(expression);
                    if (
                        flatMap && latest?.marked !== true &&
                        (isDefinitelyNonPublisherAtPath(flatMap.source, path) ||
                            isDefinitelyArrayAtPath(flatMap.source, path)) &&
                        !(options.fallbackKeyMode === "strip" && mapperHasRootKey(flatMap.mapper))
                    ) {
                        return;
                    }
                    if (flatMap) {
                        const helper = ensureLazyJsxValueImport(path, state, options.runtimeModule);
                        flatMap.call.arguments[0] = prepareJsxFlatMapMapper(flatMap.mapper, helper);
                    }
                    const assigned = flatMap ? undefined : readAssignedFlatMap(expression, path);
                    let lazy = flatMap !== undefined || (
                        assigned !== undefined && lazyAssignedBindings.has(assigned.declarator.node)
                    );
                    if (assigned?.flatMap) {
                        const ordinarySource = isDefinitelyNonPublisherAtPath(
                            assigned.flatMap.source,
                            assigned.declarator
                        ) || isDefinitelyArrayAtPath(assigned.flatMap.source, assigned.declarator);
                        const mustStripKey = options.fallbackKeyMode === "strip" &&
                            mapperHasRootKey(assigned.flatMap.mapper);
                        if (ordinarySource && !mustStripKey) {
                            return;
                        }
                        if (!allReferencesRenderDirectly(assigned.declarator)) {
                            throw path.buildCodeFrameError(
                                "A JSX flatMap stored in a variable must be used only as a direct JSX child; " +
                                "keep non-render consumers on a separate flatMap"
                            );
                        }
                        const helper = ensureLazyJsxValueImport(path, state, options.runtimeModule);
                        assigned.flatMap.call.arguments[0] = prepareJsxFlatMapMapper(
                            assigned.flatMap.mapper,
                            helper
                        );
                        lazyAssignedBindings.add(assigned.declarator.node);
                        lazy = true;
                    } else if (!lazy) {
                        const chained = assigned?.chained ?? readOuterChainJsxFlatMap(expression);
                        if (chained && !(
                            isDefinitelyNonPublisherAtPath(chained.source, path) ||
                            isDefinitelyArrayAtPath(chained.source, path)
                        )) {
                            throw path.buildCodeFrameError(
                                "A JSX flatMap must be the final operation rendered as a child; " +
                                "move fluent operators before flatMap"
                            );
                        }
                    }
                    const childExpression = {
                        source: expression,
                        mode: latest?.marked ? "latest" : "append",
                        lazy
                    } as const;
                    if (options.directChildStrategy === "component") {
                        const component = ensurePublisherChildImport(path, state, options.runtimeModule);
                        path.replaceWith(t.jsxExpressionContainer(
                            createPublisherChildElement(
                                component,
                                childExpression,
                                readUnsupportedHost(path)
                            )
                        ));
                    } else {
                        const helper = ensurePublisherChildHelperImport(path, state, options.runtimeModule);
                        path.replaceWith(t.jsxExpressionContainer(createPublisherChildCall(
                            helper,
                            childExpression,
                            readUnsupportedHost(path)
                        )));
                    }
                    return;
                }

                const mode = latest?.marked ? "latest" : nested ? "snapshot" : "incremental";
                const effectiveMapper = latest?.marked ? outerMap.mapper : nested?.mapper ?? outerMap.mapper;
                if (mode === "snapshot" && nested && snapshotMapperHasPrelude(outerMap.mapper)) {
                    throw path.buildCodeFrameError(
                        "Publisher snapshot callbacks must return list.map(...) directly; " +
                        "move outer callback statements before the Publisher expression"
                    );
                }
                if (mode === "snapshot" && nested) {
                    markSnapshotArgumentsOwner(nested.mapper);
                }
                const mapper = mode === "snapshot" && nested
                    ? prepareSnapshotRenderMapper(outerMap.mapper, effectiveMapper)
                    : prepareRenderMapper(effectiveMapper);
                const fallback = options.fallbackKeyMode === "strip"
                    ? prepareKeylessFallbackMapper(outerMap.mapper, nested ? mapper.render : undefined)
                    : prepareFallbackMapper(outerMap.mapper);
                const unsupportedHost = readUnsupportedHost(path);
                if (options.directChildStrategy !== "component") {
                    const helper = ensurePublisherSequenceHelperImport(
                        path,
                        state,
                        options.runtimeModule
                    );
                    path.replaceWith(t.jsxExpressionContainer(createPublisherSequenceCall(
                        helper,
                        outerMap.source,
                        mode,
                        mapper,
                        fallback,
                        unsupportedHost
                    )));
                } else {
                    const component = ensurePublisherSequenceImport(path, state, options.runtimeModule);
                    path.replaceWith(t.jsxExpressionContainer(createPublisherSequenceElement(
                        component,
                        outerMap.source,
                        mode,
                        mapper,
                        fallback,
                        unsupportedHost
                    )));
                }
            }
        }
    };
}

/** FlatMap initializer and binding metadata for one rendered identifier. */
interface AssignedFlatMap {
    /** Constant variable declaration owning the initializer. */
    readonly declarator: import("@babel/core").NodePath<t.VariableDeclarator>;
    /** Direct JSX flatMap initializer, when supported. */
    readonly flatMap?: NonNullable<ReturnType<typeof readJsxFlatMapExpression>>;
    /** JSX flatMap hidden behind an unsupported fluent chain. */
    readonly chained?: NonNullable<ReturnType<typeof readJsxFlatMapExpression>>;
}

/** Reads a constant identifier initialized by a direct or chained JSX flatMap. */
function readAssignedFlatMap(
    node: t.Node | null | undefined,
    path: import("@babel/core").NodePath
): AssignedFlatMap | undefined {
    const expression = unwrapExpression(node);
    if (!t.isIdentifier(expression)) {
        return undefined;
    }
    const binding = path.scope.getBinding(expression.name);
    if (!binding?.constant || !binding.path.isVariableDeclarator()) {
        return undefined;
    }
    const flatMap = readJsxFlatMapExpression(binding.path.node.init);
    if (flatMap) {
        return {declarator: binding.path, flatMap};
    }
    const chained = readOuterChainJsxFlatMap(binding.path.node.init);
    return {declarator: binding.path, ...(chained ? {chained} : {})};
}

/** Requires every reference to be rendered directly as children, never inspected. */
function allReferencesRenderDirectly(
    declarator: import("@babel/core").NodePath<t.VariableDeclarator>
): boolean {
    if (!t.isIdentifier(declarator.node.id)) {
        return false;
    }
    const binding = declarator.scope.getBinding(declarator.node.id.name);
    return binding !== undefined && binding.referencePaths.length > 0 &&
        binding.referencePaths.every(reference =>
            isTypeOnlyReference(reference) || isDirectRenderedReference(reference)
        );
}

/** Returns whether a binding reference is erased by TypeScript. */
function isTypeOnlyReference(reference: import("@babel/core").NodePath): boolean {
    return reference.findParent(parent => parent.isTSType()) !== null;
}

/** Follows syntax-only wrappers from one identifier to its JSX child container. */
function isDirectRenderedReference(reference: import("@babel/core").NodePath): boolean {
    let current = reference;
    while (current.parentPath && isTransparentExpressionPath(current.parentPath, current)) {
        current = current.parentPath;
    }
    return current.parentPath?.isJSXExpressionContainer() === true &&
        isRenderableJsxContainer(current.parentPath);
}

/** Finds a JSX-returning flatMap at the base of one fluent outer chain. */
function readOuterChainJsxFlatMap(
    node: t.Node | null | undefined
): ReturnType<typeof readJsxFlatMapExpression> {
    let current = unwrapExpression(node);
    while (t.isExpression(current)) {
        const flatMap = readJsxFlatMapExpression(current);
        if (flatMap) {
            return flatMap;
        }
        if (t.isCallExpression(current)) {
            const callee = unwrapExpression(current.callee);
            if (!t.isMemberExpression(callee)) {
                return undefined;
            }
            current = unwrapExpression(callee.object);
            continue;
        }
        if (t.isMemberExpression(current)) {
            current = unwrapExpression(current.object);
            continue;
        }
        return undefined;
    }
    return undefined;
}

/** Accepts JSX children and the equivalent explicit `children` attribute. */
function isRenderableJsxContainer(
    path: import("@babel/core").NodePath<t.JSXExpressionContainer>
): boolean {
    return !path.parentPath.isJSXAttribute() ||
        t.isJSXIdentifier(path.parentPath.node.name, {name: "children"});
}

/** Recognizes syntax-only wrappers around one direct rendered reference. */
function isTransparentExpressionPath(
    parent: import("@babel/core").NodePath,
    child: import("@babel/core").NodePath
): boolean {
    return (parent.isTSAsExpression() || parent.isTSSatisfiesExpression() ||
        parent.isTSTypeAssertion() || parent.isTSNonNullExpression() ||
        parent.isParenthesizedExpression()) && parent.get("expression") === child;
}

/** Returns host elements whose child text cannot be represented by a component. */
function readUnsupportedHost(path: import("@babel/core").NodePath<t.JSXExpressionContainer>): string | undefined {
    let parent = path.parentPath;
    if (parent.isJSXAttribute()) {
        parent = parent.parentPath;
    } else {
        while (
            parent.isJSXFragment() ||
            (parent.isJSXExpressionContainer() && t.isJSXFragment(parent.node.expression))
        ) {
            parent = parent.parentPath;
        }
    }
    const nameNode = parent.isJSXOpeningElement()
        ? parent.node.name
        : parent.isJSXElement()
            ? parent.node.openingElement.name
            : undefined;
    if (!nameNode || !t.isJSXIdentifier(nameNode)) {
        return undefined;
    }
    const name = nameNode.name;
    return name === "textarea" || name === "title" || name === "option" ? name : undefined;
}

/** Returns whether a snapshot FunctionExpression expression is provably scalar. */
function isSnapshotMapperScalar(
    node: t.Node | null | undefined,
    path: import("@babel/core").NodePath
): boolean {
    const expression = unwrapExpression(node);
    const isIndex = isArgumentsIndex(expression, 1);
    const isArrayLength = t.isMemberExpression(expression) &&
        isArgumentsIndex(expression.object, 2) && (
            !expression.computed && t.isIdentifier(expression.property, {name: "length"}) ||
            expression.computed && t.isStringLiteral(expression.property, {value: "length"})
        );
    if (!isIndex && !isArrayLength) {
        return false;
    }
    let current = path.parentPath;
    while (current) {
        if (current.isFunction()) {
            if (current.isArrowFunctionExpression()) {
                current = current.parentPath;
                continue;
            }
            return isSnapshotArgumentsOwner(current.node);
        }
        current = current.parentPath;
    }
    return false;
}

/** Recognizes one numeric access on the current function's arguments object. */
function isArgumentsIndex(node: t.Node | null | undefined, index: number): boolean {
    const expression = unwrapExpression(node);
    return t.isMemberExpression(expression) && expression.computed &&
        t.isIdentifier(expression.object, {name: "arguments"}) &&
        (t.isNumericLiteral(expression.property, {value: index}) ||
            t.isStringLiteral(expression.property, {value: String(index)}));
}
