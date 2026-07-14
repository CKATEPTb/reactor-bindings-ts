/** Compiler-only `!` latest-marker recognition. */
import * as t from "@babel/types";

/** Cleaned outer-chain expression and marker state. */
export interface LatestAssertionExpression {
    /** Expression with outer assertions removed. */
    readonly expression: t.Expression;
    /** Whether an assertion was found. */
    readonly marked: boolean;
}

/** Removes non-null assertions from an outer call/member chain. */
export function stripLatestAssertions(expression: t.Expression): LatestAssertionExpression {
    return hasLatestAssertion(expression)
        ? stripLatestFromChain(t.cloneNode(expression, true))
        : {expression, marked: false};
}

/** Recursively removes assertions from a cloned chain. */
function stripLatestFromChain(expression: t.Expression): LatestAssertionExpression {
    if (t.isTSNonNullExpression(expression)) {
        const nested = stripLatestFromChain(expression.expression);
        return {expression: nested.expression, marked: true};
    }
    const nestedExpression = readOuterChainExpression(expression);
    if (!nestedExpression) {
        return {expression, marked: false};
    }
    const nested = stripLatestFromChain(nestedExpression);
    if ((t.isCallExpression(expression) || t.isOptionalCallExpression(expression)) && t.isExpression(expression.callee)) {
        expression.callee = nested.expression;
    } else if (
        (t.isMemberExpression(expression) || t.isOptionalMemberExpression(expression)) &&
        t.isExpression(expression.object)
    ) {
        expression.object = nested.expression;
    } else if (isTransparentWrapper(expression)) {
        expression.expression = nested.expression;
    }
    return {expression, marked: nested.marked};
}

/** Detects an assertion in the outer expression chain. */
function hasLatestAssertion(expression: t.Expression): boolean {
    if (t.isTSNonNullExpression(expression)) {
        return true;
    }
    const nested = readOuterChainExpression(expression);
    return nested ? hasLatestAssertion(nested) : false;
}

/** Reads the next outer-chain expression. */
function readOuterChainExpression(expression: t.Expression): t.Expression | undefined {
    if ((t.isCallExpression(expression) || t.isOptionalCallExpression(expression)) && t.isExpression(expression.callee)) {
        return expression.callee;
    }
    if (
        (t.isMemberExpression(expression) || t.isOptionalMemberExpression(expression)) &&
        t.isExpression(expression.object)
    ) {
        return expression.object;
    }
    return isTransparentWrapper(expression) ? expression.expression : undefined;
}

/** Transparent expression wrapper type. */
type TransparentWrapper = t.Expression & {
    /** Wrapped expression. */
    expression: t.Expression;
};

/** Returns whether an expression is a transparent wrapper. */
function isTransparentWrapper(expression: t.Expression): expression is TransparentWrapper {
    return t.isTSAsExpression(expression) ||
        t.isTSSatisfiesExpression(expression) ||
        t.isTSTypeAssertion(expression) ||
        t.isTypeCastExpression(expression) ||
        t.isParenthesizedExpression(expression);
}
