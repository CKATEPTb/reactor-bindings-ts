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
    /** Whether rendering consumes snapshot index or array context. */
    readonly contextual?: boolean;
}

/** Private Babel metadata copied with cloned snapshot mapper functions. */
const SNAPSHOT_ARGUMENTS_MARKER = "reactorBindingsSnapshotArguments";

/** Marks a snapshot item mapper whose own `arguments[1]` is the rendered index. */
export function markSnapshotArgumentsOwner(mapper: MapperFunction): void {
    if (t.isFunctionExpression(mapper)) {
        mapper.extra = {...mapper.extra, [SNAPSHOT_ARGUMENTS_MARKER]: true};
    }
}

/** Recognizes a cloned snapshot mapper carrying compiler-only metadata. */
export function isSnapshotArgumentsOwner(node: t.Node): boolean {
    return t.isFunctionExpression(node) &&
        node.extra?.[SNAPSHOT_ARGUMENTS_MARKER] === true;
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

/** Preserves the outer snapshot-array binding while lifting its item mapper. */
export function prepareSnapshotRenderMapper(
    outerMapper: MapperFunction,
    itemMapper: MapperFunction
): RenderMapper {
    const parameter = outerMapper.params[0];
    if (!t.isIdentifier(parameter)) {
        throw new TypeError("Publisher snapshot mapper requires an identifier array parameter");
    }
    const prepared = prepareRenderMapper(itemMapper);
    return {
        render: wrapSnapshotMapper(prepared.render, parameter.name),
        ...(usesSnapshotContext(prepared.render, parameter.name) ? {contextual: true} : {}),
        ...(prepared.keyBy
            ? {keyBy: wrapSnapshotMapper(prepared.keyBy, parameter.name)}
            : {})
    };
}

/** Detects item renderer dependencies that must update after snapshot reordering. */
function usesSnapshotContext(mapper: MapperFunction, valuesName: string): boolean {
    if (mapper.params.length > 1 || t.isFunctionExpression(mapper)) {
        return true;
    }
    const parameterBindings = mapper.params.flatMap(parameter =>
        Object.keys(t.getBindingIdentifiers(parameter))
    );
    if (parameterBindings.includes(valuesName)) {
        return false;
    }
    let contextual = false;
    t.traverseFast(mapper.body, node => {
        contextual ||= t.isIdentifier(node, {name: valuesName});
    });
    return contextual;
}

/** Returns whether lifting a nested mapper would skip outer callback statements. */
export function snapshotMapperHasPrelude(mapper: MapperFunction): boolean {
    return t.isBlockStatement(mapper.body) && (
        mapper.body.body.length !== 1 || !t.isReturnStatement(mapper.body.body[0])
    );
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

/** Calls a lifted item mapper with value, index, and its original outer array. */
function wrapSnapshotMapper(mapper: MapperFunction, valuesName: string): MapperFunction {
    const identifiers = new Set<string>();
    t.traverseFast(mapper, node => {
        if (t.isIdentifier(node)) {
            identifiers.add(node.name);
        }
    });
    const value = uniqueParameter("_publisherValue", identifiers, valuesName);
    const index = uniqueParameter("_publisherIndex", identifiers, valuesName, value.name);
    const values = t.identifier(valuesName);
    return t.arrowFunctionExpression(
        [value, index, values],
        t.callExpression(t.cloneNode(mapper, true), [
            t.cloneNode(value),
            t.cloneNode(index),
            t.cloneNode(values)
        ])
    );
}

/** Creates a wrapper parameter that cannot capture a free mapper identifier. */
function uniqueParameter(
    preferred: string,
    identifiers: ReadonlySet<string>,
    ...reserved: string[]
): t.Identifier {
    let name = preferred;
    let suffix = 2;
    while (identifiers.has(name) || reserved.includes(name)) {
        name = `${preferred}${suffix++}`;
    }
    return t.identifier(name);
}
