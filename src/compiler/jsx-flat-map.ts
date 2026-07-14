/** JSX-returning flatMap recognition. */
import * as t from "@babel/types";
import {getFunctionOutput, readFlatMapExpression, type MapperCallExpression} from "@/compiler/expression.js";

/** Finds a flatMap callback that directly returns JSX. */
export function readJsxFlatMapExpression(node: t.Node | null | undefined): MapperCallExpression | undefined {
    const expression = readFlatMapExpression(node);
    const output = expression ? getFunctionOutput(expression.mapper) : undefined;
    return expression && output && (t.isJSXElement(output) || t.isJSXFragment(output))
        ? expression
        : undefined;
}
