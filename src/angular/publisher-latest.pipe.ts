/** Angular pipe exposing the latest Publisher value. */
import {
    ChangeDetectorRef,
    ErrorHandler,
    Pipe,
    inject,
    type OnDestroy,
    type PipeTransform
} from "@angular/core";
import type {Publisher} from "reactor-core-ts";
import {PublisherBinding} from "@/angular/publisher-binding.js";
import {PublisherFailureHandler} from "@/angular/publisher-failure-handler.js";
import type {PublisherValue} from "@/shared/publisher-value.js";

/** Subscribes to a Publisher and returns its latest emitted value. */
@Pipe({name: "publisherLatest", standalone: true, pure: false})
export class PublisherLatestPipe implements PipeTransform, OnDestroy {
    /** Angular change detector invalidated by asynchronous signals. */
    readonly #changeDetector = inject(ChangeDetectorRef);
    /** Angular error boundary. */
    readonly #errorHandler = inject(ErrorHandler);
    /** Deduplicated Publisher failure reporter. */
    readonly #failureHandler = new PublisherFailureHandler(this.#errorHandler);
    /** Publisher lifecycle binding. */
    readonly #binding = new PublisherBinding<unknown>(() => this.#changeDetector.markForCheck());
    /** Returns the latest emitted value, or `undefined` before the first signal. */
    transform<Source extends Publisher<unknown>>(source: Source): PublisherValue<Source> | undefined {
        this.#binding.connect(source as Publisher<unknown>, "latest");
        const snapshot = this.#binding.snapshot;
        this.#failureHandler.report(snapshot);
        return snapshot.entries[0]?.value as PublisherValue<Source> | undefined;
    }

    /** Cancels the active subscription. */
    ngOnDestroy(): void {
        this.#binding.disconnect();
    }
}
