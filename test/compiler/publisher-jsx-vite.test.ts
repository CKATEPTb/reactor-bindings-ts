import {describe, expect, it} from "vitest";
import {publisherJsxVite} from "@/vite/publisher-jsx-vite.js";

const plugin = publisherJsxVite({runtimeModule: "reactor-bindings-ts/test/runtime"});

describe("Publisher JSX Vite pre-transform", () => {
    it("skips TSX modules without JSX", async () => {
        await expect(transform("const value = {answer: 42};", "plain.tsx"))
            .resolves.toBeNull();
    });

    it("parses legacy decorators and returns a sourcemap object", async () => {
        const result = await transform(`
            @sealed
            class View {
                render() {
                    return <p>{numbers}</p>;
                }
            }
        `, "decorated.tsx");

        expect(result?.code).toContain("PublisherChild");
        expect(result?.map).toEqual(expect.any(Object));
    });

    it("recognizes Unicode JSX component names", async () => {
        const result = await transform(
            "const view = <Привет>{numbers}</Привет>;",
            "unicode.tsx"
        );

        expect(result?.code).toContain("renderPublisherChild(numbers)");
    });
});

/** Runs the Vite transform hook without a Rollup context, which it does not use. */
async function transform(source: string, id: string) {
    const hook = plugin.transform;
    if (typeof hook !== "function") {
        throw new TypeError("Expected a callable Vite transform hook");
    }
    const result = await hook.call({} as never, source, id);
    if (result === null) {
        return null;
    }
    if (result === undefined || typeof result === "string" || typeof result.code !== "string") {
        throw new TypeError("Expected a Vite transform result with generated code");
    }
    return {code: result.code, map: result.map};
}
