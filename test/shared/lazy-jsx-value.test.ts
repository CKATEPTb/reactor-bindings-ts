import {describe, expect, it} from "vitest";
import {
    isLazyJsxValue,
    lazyJsxValue,
    lazyJsxValueKey
} from "@/shared/lazy-jsx-value.js";

describe("lazyJsxValue", () => {
    it("creates a branded opaque one-value Publisher input", () => {
        const [descriptor] = lazyJsxValue(() => "view", 7);

        expect(isLazyJsxValue(descriptor)).toBe(true);
        expect(descriptor?.render()).toBe("view");
        expect(lazyJsxValueKey(descriptor)).toBe(7);
        expect(Object.getPrototypeOf(descriptor)).not.toBe(Object.prototype);
    });
});
