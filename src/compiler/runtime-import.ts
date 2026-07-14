/** Runtime import management for compiler-generated JSX. */
import type {NodePath, PluginPass} from "@babel/core";
import * as t from "@babel/types";

/** Per-file compiler state. */
export interface PublisherPluginState extends PluginPass {
    /** Local PublisherChild identifier. */
    publisherChildId?: t.Identifier;
    /** Local direct-child fast-path helper identifier. */
    publisherChildHelperId?: t.Identifier;
    /** Local PublisherSequence identifier. */
    publisherSequenceId?: t.Identifier;
    /** Local mapped-value fast-path helper identifier. */
    publisherSequenceHelperId?: t.Identifier;
    /** Local lazyJsxValue identifier. */
    lazyJsxValueId?: t.Identifier;
    /** Shared import declaration. */
    runtimeImport?: t.ImportDeclaration;
}

/** Ensures a PublisherChild runtime import. */
export function ensurePublisherChildImport(
    path: NodePath<t.JSXExpressionContainer>, state: PublisherPluginState, runtime: string
): t.Identifier {
    state.publisherChildId ??= ensureRuntimeImport(path, state, runtime, "PublisherChild");
    return state.publisherChildId;
}

/** Ensures a direct-child fast-path helper import. */
export function ensurePublisherChildHelperImport(
    path: NodePath,
    state: PublisherPluginState,
    runtime: string
): t.Identifier {
    state.publisherChildHelperId ??= ensureRuntimeImport(
        path,
        state,
        runtime,
        "renderPublisherChild"
    );
    return state.publisherChildHelperId;
}

/** Ensures a PublisherSequence runtime import. */
export function ensurePublisherSequenceImport(
    path: NodePath<t.JSXExpressionContainer>, state: PublisherPluginState, runtime: string
): t.Identifier {
    state.publisherSequenceId ??= ensureRuntimeImport(path, state, runtime, "PublisherSequence");
    return state.publisherSequenceId;
}

/** Ensures a mapped-sequence fast-path helper import. */
export function ensurePublisherSequenceHelperImport(
    path: NodePath,
    state: PublisherPluginState,
    runtime: string
): t.Identifier {
    state.publisherSequenceHelperId ??= ensureRuntimeImport(
        path,
        state,
        runtime,
        "renderPublisherSequence"
    );
    return state.publisherSequenceHelperId;
}

/** Ensures a lazyJsxValue runtime import. */
export function ensureLazyJsxValueImport(
    path: NodePath, state: PublisherPluginState, runtime: string
): t.Identifier {
    state.lazyJsxValueId ??= ensureRuntimeImport(path, state, runtime, "lazyJsxValue");
    return state.lazyJsxValueId;
}

/** Returns whether a node is an injected runtime component. */
export function isInjectedRuntimeElement(node: t.Node | null | undefined, state: PublisherPluginState): boolean {
    if (t.isCallExpression(node) && t.isIdentifier(node.callee)) {
        return node.callee.name === state.publisherChildHelperId?.name ||
            node.callee.name === state.publisherSequenceHelperId?.name;
    }
    if (!t.isJSXElement(node) || !t.isJSXIdentifier(node.openingElement.name)) {
        return false;
    }
    const name = node.openingElement.name.name;
    return name === state.publisherChildId?.name || name === state.publisherSequenceId?.name;
}

/** Adds one named runtime import. */
function ensureRuntimeImport(
    path: NodePath,
    state: PublisherPluginState,
    runtime: string,
    imported: "PublisherChild" | "PublisherSequence" | "lazyJsxValue" |
        "renderPublisherChild" | "renderPublisherSequence"
): t.Identifier {
    const program = path.findParent(parent => parent.isProgram()) as NodePath<t.Program> | null;
    if (!program) {
        throw path.buildCodeFrameError("Publisher JSX must be inside a program");
    }
    const local = program.scope.generateUidIdentifier(imported);
    const specifier = t.importSpecifier(t.cloneNode(local), t.identifier(imported));
    if (state.runtimeImport) {
        state.runtimeImport.specifiers.push(specifier);
    } else {
        state.runtimeImport = t.importDeclaration([specifier], t.stringLiteral(runtime));
        program.unshiftContainer("body", state.runtimeImport);
    }
    return local;
}
