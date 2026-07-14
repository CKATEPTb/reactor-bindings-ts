import {transformSync} from "@babel/core";
import {describe, expect, it} from "vitest";
import publisherJsxPlugin from "@/compiler/publisher-jsx-plugin.js";
import type {PublisherJsxPluginOptions} from "@/compiler/publisher-jsx-plugin.js";
import solidPublisherJsxPlugin from "@/solid/compiler.js";

describe("Publisher JSX compiler", () => {
    it("wraps a direct Publisher child", () => {
        const output = transform("const view = <p>{numbers}</p>");
        expect(output).toContain("PublisherChild");
        expect(output).not.toContain('mode="latest"');
    });

    it("uses a postfix non-null assertion as concise latest mode", () => {
        const output = transform("const view = <p>{numbers!}</p>");
        expect(output).toContain("source={numbers}");
        expect(output).toContain('mode="latest"');
    });

    it("finds the latest marker anywhere in the outer Publisher chain", () => {
        const output = transform(
            "const view = <p>{Flux.range(0, 300)!.delayElements(100).map(value => value + 1)}</p>"
        );
        expect(output).toContain('mode="latest"');
        expect(output).not.toContain("range(0, 300)!");
    });

    it("turns a keyed Publisher map into an incremental sequence", () => {
        const output = transform(
            "const view = <ul>{users.map(user => <li r-key={user.id}>{user.name}</li>)}</ul>"
        );
        expect(output).toContain("PublisherSequence");
        expect(output).toContain('mode="incremental"');
        expect(output).toContain("keyBy={user => user.id}");
        expect(output).not.toMatch(/render=\{user => <li r-key=/);
    });

    it("strips ordinary fallback r-keys for Solid's compiler-only key model", () => {
        const output = transform(
            "const view = <ul>{[{id: 1, name: 'Ada'}].map(user => <li r-key={user.id}>{user.name}</li>)}</ul>",
            {fallbackKeyMode: "strip"}
        );
        expect(output).toContain("PublisherSequence");
        expect(output).toContain("keyBy={user => user.id}");
        expect(output).not.toContain("<li r-key=");
    });

    it("recognizes nested map as authoritative collectList output", () => {
        const output = transform(
            "const view = <ul>{users.collectList().map(list => list.map(user => <li r-key={user.id}>{user.name}</li>))}</ul>"
        );
        expect(output).toContain('mode="snapshot"');
        expect(output).toContain("keyBy={user => user.id}");
    });

    it("lazily materializes JSX returned from flatMap", () => {
        const output = transform(
            "const view = <ul>{ids.flatMap(id => <li r-key={id}>{getUser(id)!.map(user => user.name)}</li>)}</ul>"
        );
        expect(output).toContain("lazyJsxValue");
        expect(output).toContain("PublisherChild");
        expect(output).toContain(" lazy />");
    });

    it("leaves definitely ordinary array maps untouched", () => {
        const output = transform("const view = <ul>{[1, 2].map(n => <li>{n}</li>)}</ul>");
        expect(output).not.toContain("PublisherSequence");
        expect(output).not.toContain("PublisherChild");
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
