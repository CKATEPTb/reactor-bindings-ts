/** JSX builders for runtime components. */
import * as t from "@babel/types";
import type {MapperFunction} from "@/compiler/expression.js";
import type {RenderMapper} from "@/compiler/render-mapper.js";

/** Direct Publisher child description. */
export interface PublisherChildExpression {
    /** Publisher candidate. */
    readonly source: t.Expression;
    /** Append or latest mode. */
    readonly mode: "append" | "latest";
    /** Whether ordinary output contains lazy descriptors. */
    readonly lazy?: boolean;
}

/** Creates a PublisherChild JSX element. */
export function createPublisherChildElement(
    component: t.Identifier,
    expression: PublisherChildExpression,
    unsupportedHost?: string
): t.JSXElement {
    const attributes = [expressionAttribute("source", t.cloneNode(expression.source, true))];
    if (expression.mode === "latest") {
        attributes.push(t.jsxAttribute(t.jsxIdentifier("mode"), t.stringLiteral("latest")));
    }
    if (expression.lazy) {
        attributes.push(t.jsxAttribute(t.jsxIdentifier("lazy"), null));
    }
    if (unsupportedHost) {
        attributes.push(t.jsxAttribute(
            t.jsxIdentifier("unsupportedHost"),
            t.stringLiteral(unsupportedHost)
        ));
    }
    return selfClosingElement(component, attributes);
}

/** Creates a direct-child helper call with trailing default arguments omitted. */
export function createPublisherChildCall(
    helper: t.Identifier,
    expression: PublisherChildExpression,
    unsupportedHost?: string
): t.CallExpression {
    const args: t.Expression[] = [t.cloneNode(expression.source, true)];
    if (expression.mode === "latest" || expression.lazy || unsupportedHost) {
        args.push(t.stringLiteral(expression.mode));
    }
    if (expression.lazy || unsupportedHost) {
        args.push(t.booleanLiteral(expression.lazy === true));
    }
    if (unsupportedHost) {
        args.push(t.stringLiteral(unsupportedHost));
    }
    return t.callExpression(t.cloneNode(helper), args);
}

/** Creates a PublisherSequence JSX element. */
export function createPublisherSequenceElement(
    component: t.Identifier,
    source: t.Expression,
    mode: "incremental" | "latest" | "snapshot",
    mapper: RenderMapper,
    fallbackRender: MapperFunction,
    unsupportedHost?: string
): t.JSXElement {
    const attributes = [
        expressionAttribute("source", t.cloneNode(source, true)),
        t.jsxAttribute(t.jsxIdentifier("mode"), t.stringLiteral(mode)),
        expressionAttribute("render", mapper.render),
        expressionAttribute("fallbackRender", fallbackRender)
    ];
    if (mapper.keyBy) {
        attributes.push(expressionAttribute("keyBy", mapper.keyBy));
    }
    if (mapper.contextual) {
        attributes.push(t.jsxAttribute(t.jsxIdentifier("contextual"), null));
    }
    if (unsupportedHost) {
        attributes.push(t.jsxAttribute(
            t.jsxIdentifier("unsupportedHost"),
            t.stringLiteral(unsupportedHost)
        ));
    }
    return selfClosingElement(component, attributes);
}

/** Creates a mapped-value fast-path call with an optional text-only host guard. */
export function createPublisherSequenceCall(
    helper: t.Identifier,
    source: t.Expression,
    mode: "incremental" | "latest" | "snapshot",
    mapper: RenderMapper,
    fallbackRender: MapperFunction,
    unsupportedHost?: string
): t.CallExpression {
    const properties = [
        t.objectProperty(t.identifier("source"), t.cloneNode(source, true)),
        t.objectProperty(t.identifier("mode"), t.stringLiteral(mode)),
        t.objectProperty(t.identifier("render"), mapper.render),
        t.objectProperty(t.identifier("fallbackRender"), fallbackRender)
    ];
    if (mapper.keyBy) {
        properties.push(t.objectProperty(t.identifier("keyBy"), mapper.keyBy));
    }
    if (mapper.contextual) {
        properties.push(t.objectProperty(t.identifier("contextual"), t.booleanLiteral(true)));
    }
    const args: t.Expression[] = [t.objectExpression(properties)];
    if (unsupportedHost) {
        args.push(t.stringLiteral(unsupportedHost));
    }
    return t.callExpression(t.cloneNode(helper), args);
}

/** Creates one expression-valued JSX attribute. */
function expressionAttribute(name: string, expression: t.Expression): t.JSXAttribute {
    return t.jsxAttribute(t.jsxIdentifier(name), t.jsxExpressionContainer(expression));
}

/** Creates a self-closing component element. */
function selfClosingElement(component: t.Identifier, attributes: t.JSXAttribute[]): t.JSXElement {
    return t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier(component.name), attributes, true),
        null,
        [],
        true
    );
}
