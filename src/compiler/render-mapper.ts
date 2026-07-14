/** Render mapper, key extraction, and lazy flatMap transforms. */
import * as t from "@babel/types";
import {
    getFunctionOutput,
    readMapExpression,
    replaceFunctionOutput,
    type MapperCallExpression,
    type MapperFunction
} from "@/compiler/expression.js";

/** Prepared Publisher renderer and optional key selector. */
export interface RenderMapper {
    /** Renderer with its compiler-consumed key removed. */
    readonly render: MapperFunction;
    /** Extracted key selector. */
    readonly keyBy?: MapperFunction;
}

/** Root JSX reconciliation attribute. */
interface KeyAttribute {
    /** Element containing the key. */
    readonly element: t.JSXElement;
    /** Key expression. */
    readonly expression: t.Expression;
}

/** Clones a mapper and extracts its root reconciliation key. */
export function prepareRenderMapper(mapper: MapperFunction): RenderMapper {
    const render = t.cloneNode(mapper, true);
    const output = getFunctionOutput(render);
    const key = output ? readKeyAttribute(output) : undefined;
    if (!key) {
        return {render};
    }
    removeKeyAttribute(key.element);
    const keyBy = t.cloneNode(mapper, true);
    const keyOutput = getFunctionOutput(keyBy);
    const clonedKey = keyOutput ? readKeyAttribute(keyOutput) : undefined;
    if (!clonedKey) {
        return {render};
    }
    replaceFunctionOutput(keyBy, t.cloneNode(clonedKey.expression, true));
    return {render, keyBy};
}

/** Converts JSX returned from flatMap into a lazy one-value input. */
export function prepareJsxFlatMapMapper(mapper: MapperFunction, helper: t.Identifier): MapperFunction {
    const prepared = t.cloneNode(mapper, true);
    const output = getFunctionOutput(prepared);
    if (!output) {
        throw new TypeError("JSX flatMap mapper must return one expression");
    }
    const key = readKeyAttribute(output);
    if (key) {
        removeKeyAttribute(key.element);
    }
    const args: t.Expression[] = [t.arrowFunctionExpression([], output)];
    if (key) {
        args.push(t.cloneNode(key.expression, true));
    }
    replaceFunctionOutput(prepared, t.callExpression(t.cloneNode(helper), args));
    return prepared;
}

/** Finds list.map returned from an outer Publisher mapper. */
export function readNestedMapExpression(mapper: MapperFunction): MapperCallExpression | undefined {
    const output = getFunctionOutput(mapper);
    const nested = output ? readMapExpression(output) : undefined;
    const parameter = mapper.params[0];
    return nested && t.isIdentifier(parameter) && t.isIdentifier(nested.source, {name: parameter.name})
        ? nested
        : undefined;
}

/** Clones an ordinary fallback mapper without consuming native JSX keys. */
export function prepareFallbackMapper(mapper: MapperFunction): MapperFunction {
    return t.cloneNode(mapper, true);
}

/**
 * Creates an ordinary fallback whose root keys remain compiler-only.
 *
 * Solid does not use JSX `r-key` as a native renderer hint, so leaving it in an
 * ordinary fallback would create an unwanted DOM attribute.
 */
export function prepareKeylessFallbackMapper(
    outerMapper: MapperFunction,
    nestedRender?: MapperFunction
): MapperFunction {
    if (!nestedRender) {
        return prepareRenderMapper(outerMapper).render;
    }
    const fallback = t.cloneNode(outerMapper, true);
    const output = getFunctionOutput(fallback);
    const nested = output ? readMapExpression(output) : undefined;
    if (nested) {
        nested.call.arguments[0] = t.cloneNode(nestedRender, true);
    }
    return fallback;
}

/** Returns whether a mapper's direct JSX output carries a root reconciliation key. */
export function mapperHasRootKey(mapper: MapperFunction): boolean {
    const output = getFunctionOutput(mapper);
    return output !== undefined && readKeyAttribute(output) !== undefined;
}

/** Reads a root JSX `r-key` attribute. */
function readKeyAttribute(output: t.Expression): KeyAttribute | undefined {
    if (!t.isJSXElement(output)) {
        return undefined;
    }
    const attribute = output.openingElement.attributes.find(candidate =>
        t.isJSXAttribute(candidate) && t.isJSXIdentifier(candidate.name, {name: "r-key"})
    );
    if (!attribute || !t.isJSXAttribute(attribute)) {
        return undefined;
    }
    const value = attribute.value;
    const expression = !value
        ? t.booleanLiteral(true)
        : t.isStringLiteral(value)
            ? t.cloneNode(value)
            : t.isJSXExpressionContainer(value) && t.isExpression(value.expression)
                ? value.expression
                : undefined;
    return expression ? {element: output, expression} : undefined;
}

/** Removes the `r-key` consumed by Publisher reconciliation. */
function removeKeyAttribute(element: t.JSXElement): void {
    element.openingElement.attributes = element.openingElement.attributes.filter(attribute =>
        !(t.isJSXAttribute(attribute) && t.isJSXIdentifier(attribute.name, {name: "r-key"}))
    );
}
