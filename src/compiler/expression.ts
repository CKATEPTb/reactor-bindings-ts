/** Babel expression helpers for Publisher JSX transforms. */
import * as t from "@babel/types";

/** Supported mapper callback shape. */
export type MapperFunction = t.ArrowFunctionExpression | t.FunctionExpression;

/** Parsed map or flatMap call. */
export interface MapperCallExpression {
    /** Complete call expression. */
    readonly call: t.CallExpression;
    /** Receiver expression. */
    readonly source: t.Expression;
    /** First callback argument. */
    readonly mapper: MapperFunction;
}

/** Parses a supported map call. */
export function readMapExpression(node: t.Node | null | undefined): MapperCallExpression | undefined {
    return readMapperExpression(node, "map", 1);
}

/** Parses a supported flatMap call. */
export function readFlatMapExpression(node: t.Node | null | undefined): MapperCallExpression | undefined {
    return readMapperExpression(node, "flatMap", 2);
}

/** Finds the returned expression of a supported mapper. */
export function getFunctionOutput(mapper: MapperFunction): t.Expression | undefined {
    if (t.isArrowFunctionExpression(mapper) && !t.isBlockStatement(mapper.body)) {
        const output = unwrapExpression(mapper.body);
        return t.isExpression(output) ? output : undefined;
    }
    if (!t.isBlockStatement(mapper.body)) {
        return undefined;
    }
    const returns = mapper.body.body.filter(
        (statement): statement is t.ReturnStatement => t.isReturnStatement(statement)
    );
    const output = returns.length === 1 ? unwrapExpression(returns[0]!.argument) : undefined;
    return t.isExpression(output) ? output : undefined;
}

/** Replaces the returned expression of a supported mapper. */
export function replaceFunctionOutput(mapper: MapperFunction, output: t.Expression): void {
    if (t.isArrowFunctionExpression(mapper) && !t.isBlockStatement(mapper.body)) {
        mapper.body = output;
        return;
    }
    if (!t.isBlockStatement(mapper.body)) {
        throw new TypeError("Publisher mapper must return one expression");
    }
    const statement = mapper.body.body.find(
        (candidate): candidate is t.ReturnStatement => t.isReturnStatement(candidate)
    );
    if (!statement) {
        throw new TypeError("Publisher mapper must contain one return statement");
    }
    statement.argument = output;
}

/** Removes transparent syntax-only expression wrappers. */
export function unwrapExpression(node: t.Node | null | undefined): t.Node | null | undefined {
    let current = node;
    while (
        t.isTSAsExpression(current) ||
        t.isTSSatisfiesExpression(current) ||
        t.isTSTypeAssertion(current) ||
        t.isTypeCastExpression(current) ||
        t.isParenthesizedExpression(current)
    ) {
        current = current.expression;
    }
    return current;
}

/** Parses one supported mapper method call. */
function readMapperExpression(
    node: t.Node | null | undefined,
    method: "map" | "flatMap",
    maximumArguments: number
): MapperCallExpression | undefined {
    const expression = unwrapExpression(node);
    if (!t.isCallExpression(expression) || expression.arguments.length < 1 || expression.arguments.length > maximumArguments) {
        return undefined;
    }
    const callee = unwrapExpression(expression.callee);
    if (!t.isMemberExpression(callee) || callee.computed || !t.isIdentifier(callee.property, {name: method})) {
        return undefined;
    }
    const mapper = expression.arguments[0];
    const source = unwrapExpression(callee.object);
    if (
        (!t.isArrowFunctionExpression(mapper) && !t.isFunctionExpression(mapper)) ||
        !t.isExpression(source)
    ) {
        return undefined;
    }
    return {call: expression, source, mapper};
}
