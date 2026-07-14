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
    expression: PublisherChildExpression
): t.JSXElement {
    const attributes = [expressionAttribute("source", t.cloneNode(expression.source, true))];
    if (expression.mode === "latest") {
        attributes.push(t.jsxAttribute(t.jsxIdentifier("mode"), t.stringLiteral("latest")));
    }
    if (expression.lazy) {
        attributes.push(t.jsxAttribute(t.jsxIdentifier("lazy"), null));
    }
    return selfClosingElement(component, attributes);
}

/** Creates a PublisherSequence JSX element. */
export function createPublisherSequenceElement(
    component: t.Identifier,
    source: t.Expression,
    mode: "incremental" | "latest" | "snapshot",
    mapper: RenderMapper,
    fallbackRender: MapperFunction
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
    return selfClosingElement(component, attributes);
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
