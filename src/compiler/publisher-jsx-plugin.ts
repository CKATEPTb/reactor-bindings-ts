/** Shared Babel transform for React, Preact, and Vue JSX. */
import type {PluginObj} from "@babel/core";
import * as t from "@babel/types";
import {
    isDefinitelyNonPublisher,
    isDefinitelyNonPublisherAtPath
} from "@/compiler/definite-non-publisher.js";
import {readMapExpression, unwrapExpression} from "@/compiler/expression.js";
import {readJsxFlatMapExpression} from "@/compiler/jsx-flat-map.js";
import {stripLatestAssertions} from "@/compiler/latest-assertion.js";
import {
    prepareFallbackMapper,
    prepareKeylessFallbackMapper,
    mapperHasRootKey,
    prepareJsxFlatMapMapper,
    prepareRenderMapper,
    readNestedMapExpression
} from "@/compiler/render-mapper.js";
import {
    ensureLazyJsxValueImport,
    ensurePublisherChildImport,
    ensurePublisherSequenceImport,
    isInjectedRuntimeElement,
    type PublisherPluginState
} from "@/compiler/runtime-import.js";
import {createPublisherChildElement, createPublisherSequenceElement} from "@/compiler/runtime-elements.js";

/** Babel plugin options. */
export interface PublisherJsxPluginOptions {
    /** Framework runtime module injected into transformed files. */
    readonly runtimeModule: string;
    /** Whether ordinary fallback JSX keys remain native or compiler-only. */
    readonly fallbackKeyMode?: "native" | "strip";
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
    return {
        name: "reactor-bindings-publisher-jsx",
        visitor: {
            JSXExpressionContainer(path, state) {
                if (path.parentPath.isJSXAttribute()) {
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
                    (isDefinitelyNonPublisherAtPath(expression, path) ||
                        (outerMap && isDefinitelyNonPublisher(outerMap.source) && !mustStripMapKey))
                ) {
                    return;
                }
                if (!outerMap) {
                    if (!t.isExpression(expression)) {
                        return;
                    }
                    const flatMap = readJsxFlatMapExpression(expression);
                    if (
                        flatMap && latest?.marked !== true && isDefinitelyNonPublisher(flatMap.source) &&
                        !(options.fallbackKeyMode === "strip" && mapperHasRootKey(flatMap.mapper))
                    ) {
                        return;
                    }
                    if (flatMap) {
                        const helper = ensureLazyJsxValueImport(path, state, options.runtimeModule);
                        flatMap.call.arguments[0] = prepareJsxFlatMapMapper(flatMap.mapper, helper);
                    }
                    const component = ensurePublisherChildImport(path, state, options.runtimeModule);
                    path.replaceWith(t.jsxExpressionContainer(createPublisherChildElement(component, {
                        source: expression,
                        mode: latest?.marked ? "latest" : "append",
                        lazy: flatMap !== undefined
                    })));
                    return;
                }

                const mode = latest?.marked ? "latest" : nested ? "snapshot" : "incremental";
                const effectiveMapper = latest?.marked ? outerMap.mapper : nested?.mapper ?? outerMap.mapper;
                const mapper = prepareRenderMapper(effectiveMapper);
                const fallback = options.fallbackKeyMode === "strip"
                    ? prepareKeylessFallbackMapper(outerMap.mapper, nested ? mapper.render : undefined)
                    : prepareFallbackMapper(outerMap.mapper);
                const component = ensurePublisherSequenceImport(path, state, options.runtimeModule);
                path.replaceWith(t.jsxExpressionContainer(createPublisherSequenceElement(
                    component,
                    outerMap.source,
                    mode,
                    mapper,
                    fallback
                )));
            }
        }
    };
}
