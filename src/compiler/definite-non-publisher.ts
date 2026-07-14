/** Conservative static Publisher impossibility checks. */
import type {NodePath} from "@babel/core";
import * as t from "@babel/types";
import {readMapExpression, unwrapExpression} from "@/compiler/expression.js";

/** Returns true only when an expression cannot satisfy Publisher structurally. */
export function isDefinitelyNonPublisher(node: t.Node | null | undefined): boolean {
    const expression = unwrapExpression(node);
    if (!t.isExpression(expression)) {
        return false;
    }
    if (
        t.isLiteral(expression) || t.isTemplateLiteral(expression) ||
        t.isBinaryExpression(expression) || t.isUnaryExpression(expression) ||
        t.isUpdateExpression(expression) || t.isFunctionExpression(expression) ||
        t.isArrowFunctionExpression(expression) || t.isJSXElement(expression) ||
        t.isJSXFragment(expression) || t.isArrayExpression(expression)
    ) {
        return true;
    }
    if (t.isConditionalExpression(expression)) {
        return isDefinitelyNonPublisher(expression.consequent) &&
            isDefinitelyNonPublisher(expression.alternate);
    }
    if (t.isLogicalExpression(expression)) {
        return isDefinitelyNonPublisher(expression.left) &&
            isDefinitelyNonPublisher(expression.right);
    }
    if (t.isSequenceExpression(expression)) {
        return isDefinitelyNonPublisher(expression.expressions.at(-1));
    }
    if (t.isAssignmentExpression(expression, {operator: "="})) {
        return isDefinitelyNonPublisher(expression.right);
    }
    return t.isObjectExpression(expression) && expression.properties.every(property => {
        if (t.isSpreadElement(property) || property.computed) {
            return false;
        }
        const key = property.key;
        return !(t.isIdentifier(key, {name: "subscribe"}) ||
            t.isStringLiteral(key, {value: "subscribe"}) ||
            t.isIdentifier(key, {name: "__proto__"}) ||
            t.isStringLiteral(key, {value: "__proto__"}));
    });
}

/**
 * Adds scope-aware checks for values originating from a statically ordinary array map.
 *
 * @param node - Candidate expression.
 * @param path - Babel path whose lexical scope contains the expression.
 * @returns Whether the expression is provably not a Publisher.
 */
export function isDefinitelyNonPublisherAtPath(
    node: t.Node | null | undefined,
    path: NodePath
): boolean {
    if (isDefinitelyNonPublisher(node)) {
        return true;
    }
    const expression = unwrapExpression(node);
    if (!t.isIdentifier(expression)) {
        return false;
    }
    const binding = path.scope.getBinding(expression.name);
    if (!binding || !binding.path.isIdentifier()) {
        return false;
    }
    const functionPath = binding.path.parentPath;
    if (
        (!functionPath.isArrowFunctionExpression() && !functionPath.isFunctionExpression()) ||
        functionPath.node.params[0] !== binding.path.node
    ) {
        return false;
    }
    const callPath = functionPath.parentPath;
    const map = callPath?.isCallExpression() ? readMapExpression(callPath.node) : undefined;
    if (!map || map.mapper !== functionPath.node || !t.isArrayExpression(map.source)) {
        return false;
    }
    return map.source.elements.every(element =>
        element !== null && !t.isSpreadElement(element) && isDefinitelyNonPublisher(element)
    );
}
