import "zone.js";
import "zone.js/testing";
import "@angular/compiler";
import {Component, inject} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import {
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting
} from "@angular/platform-browser-dynamic/testing";
import {Flux} from "reactor-core-ts";
import {afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {PublisherDirective} from "@/angular/publisher.directive.js";
import {PublisherLatestPipe} from "@/angular/publisher-latest.pipe.js";
import {PublisherValuesPipe} from "@/angular/publisher-values.pipe.js";
import {controlledFlux, flushPublisher, type ControlledFlux} from "@/test/helpers/controlled-flux.js";

interface User {
    readonly id: number;
    readonly name: string;
}

let source: ControlledFlux<User>;
let numberSource: ControlledFlux<number>;
let snapshotSource: ControlledFlux<readonly User[]>;

@Component({
    standalone: true,
    imports: [PublisherDirective],
    template: `
        <ul>
            <li *publisher="let user from users; keyBy: userKey">{{ user.name }}</li>
        </ul>
    `
})
class TestHost {
    readonly users = source.flux;
    readonly userKey = (user: User): number => user.id;
}

@Component({
    standalone: true,
    imports: [PublisherDirective],
    template: `
        <ul>
            <li *publisher="let user from users; let i = index; let total = count;
                            mode: 'snapshot'; keyBy: userKey">
                {{ user.name }}:{{ i }}/{{ total }}
            </li>
        </ul>
    `
})
class SnapshotHost {
    readonly users = snapshotSource.flux;
    readonly userKey = (user: User): number => user.id;
}

@Component({
    standalone: true,
    imports: [PublisherLatestPipe],
    template: `<p>{{ numbers | publisherLatest }}</p>`
})
class LatestPipeHost {
    readonly numbers = numberSource.flux;
}

@Component({
    standalone: true,
    providers: [PublisherValuesPipe],
    template: ""
})
class ValuesPipeHost {
    readonly pipe = inject(PublisherValuesPipe);
}

describe("Angular Publisher directive", () => {
    beforeAll(() => {
        TestBed.initTestEnvironment(
            BrowserDynamicTestingModule,
            platformBrowserDynamicTesting()
        );
    });

    beforeEach(() => {
        source = controlledFlux<User>();
        numberSource = controlledFlux<number>();
        snapshotSource = controlledFlux<readonly User[]>();
    });

    afterEach(() => TestBed.resetTestingModule());

    it("updates a keyed embedded view in place", async () => {
        const fixture = TestBed.createComponent(TestHost);
        fixture.detectChanges();

        source.next({id: 1, name: "before"});
        await flushPublisher();
        const original = fixture.nativeElement.querySelector("li") as HTMLLIElement;
        source.next({id: 1, name: "after"});
        await flushPublisher();

        expect(fixture.nativeElement.querySelector("li")).toBe(original);
        expect(original.textContent).toContain("after");
        fixture.destroy();
        expect(source.cancellationCount).toBe(1);
    });

    it("refreshes a keyed view when the same mutated object is emitted again", async () => {
        const fixture = TestBed.createComponent(TestHost);
        fixture.detectChanges();
        const user = {id: 1, name: "before"};

        source.next(user);
        await flushPublisher();
        const original = fixture.nativeElement.querySelector("li") as HTMLLIElement;
        user.name = "after";
        source.next(user);
        await flushPublisher();

        expect(fixture.nativeElement.querySelector("li")).toBe(original);
        expect(original.textContent).toContain("after");
        fixture.destroy();
    });

    it("reorders retained views and removes stale views", async () => {
        const fixture = TestBed.createComponent(SnapshotHost);
        fixture.detectChanges();

        snapshotSource.next([
            {id: 1, name: "one"},
            {id: 2, name: "two"},
            {id: 3, name: "three"}
        ]);
        await flushPublisher();
        const original = [...fixture.nativeElement.querySelectorAll("li")] as HTMLLIElement[];

        snapshotSource.next([
            {id: 3, name: "THREE"},
            {id: 1, name: "ONE"}
        ]);
        await flushPublisher();
        const reordered = [...fixture.nativeElement.querySelectorAll("li")] as HTMLLIElement[];

        expect(reordered).toEqual([original[2], original[0]]);
        expect(reordered.map(element => element.textContent?.trim())).toEqual([
            "THREE:0/2",
            "ONE:1/2"
        ]);
        fixture.destroy();
    });

    it("exposes the latest value through a template pipe", async () => {
        const fixture = TestBed.createComponent(LatestPipeHost);
        fixture.detectChanges();

        numberSource.next(1);
        numberSource.next(2);
        await flushPublisher();
        fixture.detectChanges();

        expect(fixture.nativeElement.textContent).toContain("2");
        fixture.destroy();
        expect(numberSource.cancellationCount).toBe(1);
    });

    it("refreshes values when synchronous Publishers have the same revision", () => {
        const fixture = TestBed.createComponent(ValuesPipeHost);

        expect(fixture.componentInstance.pipe.transform(Flux.just(1))).toEqual([1]);
        expect(fixture.componentInstance.pipe.transform(Flux.just(2))).toEqual([2]);
        fixture.destroy();
    });
});
