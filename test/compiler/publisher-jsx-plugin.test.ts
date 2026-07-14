import {transformSync} from "@babel/core";
import {describe, expect, it} from "vitest";
import defaultPublisherJsxPlugin, {
    publisherJsxPlugin as namedPublisherJsxPlugin
} from "@/compiler/index.js";
import publisherJsxPlugin from "@/compiler/publisher-jsx-plugin.js";
import type {PublisherJsxPluginOptions} from "@/compiler/publisher-jsx-plugin.js";
import solidPublisherJsxPlugin from "@/solid/compiler.js";

describe("Publisher JSX compiler", () => {
    it("provides matching default and named compiler exports", () => {
        expect(defaultPublisherJsxPlugin).toBe(namedPublisherJsxPlugin);
    });

    it("wraps a direct Publisher child", () => {
        const output = transform("const view = <p>{numbers}</p>");
        expect(output).toContain("renderPublisherChild(numbers)");
        expect(output).not.toContain('mode="latest"');
    });

    it("marks text-only hosts so real Publishers fail clearly at runtime", () => {
        const output = transform("const view = <textarea>{text}</textarea>");
        expect(output).toContain('renderPublisherChild(text, "append", false, "textarea")');
    });

    it("inherits text-only host validation through transparent fragments", () => {
        const output = transform("const view = <textarea><>{text}</></textarea>");
        expect(output).toContain('renderPublisherChild(text, "append", false, "textarea")');
    });

    it("guards mapped Publishers in text-only hosts without wrapping ordinary maps", () => {
        const output = transform("const view = <title>{texts.map(text => text)}</title>");
        expect(output).toContain('renderPublisherSequence({');
        expect(output).toContain('}, "title")');
    });

    it("transforms the explicit children prop like child syntax", () => {
        const output = transform("const view = <Box children={numbers} />");
        expect(output).toContain("children={_renderPublisherChild(numbers)}");
    });

    it("uses a postfix non-null assertion as concise latest mode", () => {
        const output = transform("const view = <p>{numbers!}</p>");
        expect(output).toContain('renderPublisherChild(numbers, "latest")');
    });

    it("finds the latest marker anywhere in the outer Publisher chain", () => {
        const output = transform(
            "const view = <p>{Flux.range(0, 300)!.delayElements(100).map(value => value + 1)}</p>"
        );
        expect(output).toContain('mode: "latest"');
        expect(output).not.toContain("range(0, 300)!");
    });

    it("turns a keyed Publisher map into an incremental sequence", () => {
        const output = transform(
            "const view = <ul>{users.map(user => <li r-key={user.id}>{user.name}</li>)}</ul>"
        );
        expect(output).toContain("renderPublisherSequence");
        expect(output).toContain('mode: "incremental"');
        expect(output).toContain("keyBy: user => user.id");
        expect(output).not.toMatch(/render=\{user => <li r-key=/);
    });

    it("strips ordinary fallback r-keys for Solid's compiler-only key model", () => {
        const output = transform(
            "const view = <ul>{[{id: 1, name: 'Ada'}].map(user => <li r-key={user.id}>{user.name}</li>)}</ul>",
            {fallbackKeyMode: "strip"}
        );
        expect(output).toContain("renderPublisherSequence");
        expect(output).toContain("keyBy: user => user.id");
        expect(output).not.toContain("<li r-key=");
    });

    it("recognizes nested map as authoritative collectList output", () => {
        const output = transform(
            "const view = <ul>{users.collectList().map(list => list.map(user => <li r-key={user.id}>{user.name}</li>))}</ul>"
        );
        expect(output).toContain('mode: "snapshot"');
        expect(output).toMatch(/keyBy: \(_publisherValue, _publisherIndex, list\) =>/);
    });

    it("preserves native snapshot index and outer-array bindings", () => {
        const output = transform(
            "const view = <ul>{users.map(list => list.map((user, index) => " +
            "<li r-key={list[index].id}>{index}:{list.length}:{user.name}</li>))}</ul>"
        );
        expect(output).toContain("(_publisherValue, _publisherIndex, list)");
        expect(output).toContain("contextual: true");
        expect(output).toContain("list[index].id");
    });

    it("keeps function-expression arguments reactive in snapshot renderers", () => {
        const output = transform(
            "const view = <ul>{users.map(list => list.map(function (user) { " +
            "return <li>{arguments[1]}:{arguments[2].length}:{user.name}</li>; }))}</ul>"
        );
        expect(output).toContain("contextual: true");
        expect(output).not.toContain("renderPublisherChild(arguments[1])");
        expect(output).not.toContain("renderPublisherChild(arguments[2].length)");
    });

    it("rejects snapshot callbacks whose lifted scope would skip statements", () => {
        expect(() => transform(
            "const view = <ul>{users.map(list => { const size = list.length; " +
            "return list.map(user => <li>{size}:{user.name}</li>); })}</ul>"
        )).toThrow("Publisher snapshot callbacks must return list.map(...) directly");
    });

    it("lazily materializes JSX returned from flatMap", () => {
        const output = transform(
            "const view = <ul>{ids.flatMap(id => <li r-key={id}>{getUser(id)!.map(user => user.name)}</li>)}</ul>"
        );
        expect(output).toContain("lazyJsxValue");
        expect(output).toContain('renderPublisherChild(ids.flatMap');
        expect(output).toContain(', "append", true)');
    });

    it("rejects operators chained after a JSX flatMap", () => {
        expect(() => transform(
            "const view = <ul>{ids.flatMap(id => <li>{id}</li>).delayElements(10)}</ul>"
        )).toThrow("move fluent operators before flatMap");
    });

    it("lazily compiles an assigned flatMap later rendered as JSX", () => {
        const output = transform(
            "const items = ids.flatMap(id => <li>{id}</li>); const view = <ul>{items}</ul>"
        );
        expect(output).toContain("const items = ids.flatMap(id => _lazyJsxValue");
        expect(output).toContain('renderPublisherChild(items, "append", true)');
    });

    it("compiles an assigned flatMap independently of declaration order", () => {
        const output = transform(
            "const view = () => <ul>{items}</ul>; " +
            "const items = ids.flatMap(id => <li>{id}</li>)"
        );
        expect(output).toContain("const items = ids.flatMap(id => _lazyJsxValue");
        expect(output).toContain('renderPublisherChild(items, "append", true)');
    });

    it("materializes an assigned ordinary flatMap at every direct render site", () => {
        const output = transform(
            "const items = ids.flatMap(id => <li>{id}</li>); " +
            "const view = <><ul>{items}</ul><ol>{items}</ol></>"
        );
        expect(output.match(/renderPublisherChild\(items, "append", true\)/g)).toHaveLength(2);
    });

    it("rejects an assigned JSX flatMap with a non-render consumer", () => {
        expect(() => transform(
            "const items = ids.flatMap(id => <li>{id}</li>); " +
            "inspect(items); const view = <ul>{items}</ul>"
        )).toThrow("must be used only as a direct JSX child");
    });

    it("ignores type-only references to an assigned JSX flatMap", () => {
        const output = transform(
            "const items = ids.flatMap(id => <li>{id}</li>); " +
            "type Items = typeof items; const view = <ul>{items}</ul>"
        );
        expect(output).toContain('renderPublisherChild(items, "append", true)');
    });

    it("does not rewrite flatMap inside a non-children prop", () => {
        const output = transform(
            "const view = <div><Box values={ids.flatMap(id => <li>{id}</li>)} /></div>"
        );
        expect(output).not.toContain("lazyJsxValue");
    });

    it("does not rewrite flatMap inspected by an outer child expression", () => {
        const output = transform(
            "const view = <output>{JSON.stringify(ids.flatMap(id => <li>{id}</li>))}</output>"
        );
        expect(output).not.toContain("lazyJsxValue");
    });

    it("keeps assigned native-array flatMap results eager", () => {
        const output = transform(
            "const ids = [1, 2]; const items = ids.flatMap(id => <li>{id}</li>); " +
            "const view = <ul>{items}</ul>"
        );
        expect(output).toContain("const items = ids.flatMap(id => <li>{id}</li>)");
        expect(output).not.toContain("lazyJsxValue");
    });

    it("leaves definitely ordinary array maps untouched", () => {
        const output = transform("const view = <ul>{[1, 2].map(n => <li>{n}</li>)}</ul>");
        expect(output).not.toContain("PublisherSequence");
        expect(output).not.toContain("PublisherChild");
    });

    it("binds Publisher results returned by a definitely ordinary array map", () => {
        const output = transform("const view = <p>{[1].map(() => publisher)}</p>");
        expect(output).toContain("renderPublisherSequence");
    });

    it("leaves definitely ordinary array aliases on the native JSX path", () => {
        const output = transform(
            "const ids = [1, 2]; const view = <ul>{ids.map(id => <li>{id}</li>)}</ul>"
        );
        expect(output).not.toContain("renderPublisherSequence");
    });

    it("keeps ambiguous Publishers nested in array children on the runtime path", () => {
        const output = transform("const view = <p>{[prefix, numbers]}</p>");
        expect(output).toContain("renderPublisherChild([prefix, numbers])");
    });

    it("provides Solid runtime and key defaults through its compiler module", () => {
        const output = transformSync(
            "const view = <ul>{[{id: 1}].map(value => <li r-key={value.id}>{value.id}</li>)}</ul>",
            {
                filename: "solid.tsx",
                configFile: false,
                babelrc: false,
                parserOpts: {plugins: ["typescript", "jsx"]},
                plugins: [solidPublisherJsxPlugin]
            }
        )?.code ?? "";
        expect(output).toContain('from "reactor-bindings-ts/solid/runtime"');
        expect(output).not.toContain("<li r-key=");
    });

    it("passes text-only host validation to Solid runtime components", () => {
        const output = transformSync("const view = <textarea>{text}</textarea>", {
            filename: "solid.tsx",
            configFile: false,
            babelrc: false,
            parserOpts: {plugins: ["typescript", "jsx"]},
            plugins: [solidPublisherJsxPlugin]
        })?.code ?? "";
        expect(output).toContain('unsupportedHost="textarea"');
    });
});

/** Runs the compiler with TypeScript and JSX parsing enabled. */
function transform(
    source: string,
    options: Partial<PublisherJsxPluginOptions> = {}
): string {
    return transformSync(source, {
        filename: "example.tsx",
        configFile: false,
        babelrc: false,
        parserOpts: {plugins: ["typescript", "jsx"]},
        plugins: [[publisherJsxPlugin, {
            runtimeModule: "reactor-bindings-ts/test/runtime",
            ...options
        }]]
    })?.code ?? "";
}
