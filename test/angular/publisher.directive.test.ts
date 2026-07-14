import "zone.js";
import "zone.js/testing";
import "@angular/compiler";
import {Component} from "@angular/core";
import {TestBed} from "@angular/core/testing";
import {
    BrowserDynamicTestingModule,
    platformBrowserDynamicTesting
} from "@angular/platform-browser-dynamic/testing";
import {afterEach, beforeAll, beforeEach, describe, expect, it} from "vitest";
import {PublisherDirective} from "@/angular/publisher.directive.js";
import {PublisherLatestPipe} from "@/angular/publisher-latest.pipe.js";
import {controlledFlux, flushPublisher, type ControlledFlux} from "@/test/helpers/controlled-flux.js";

interface User {
    readonly id: number;
    readonly name: string;
}

let source: ControlledFlux<User>;
let numberSource: ControlledFlux<number>;

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
    imports: [PublisherLatestPipe],
    template: `<p>{{ numbers | publisherLatest }}</p>`
})
class LatestPipeHost {
    readonly numbers = numberSource.flux;
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
});
