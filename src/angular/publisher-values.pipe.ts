/** Angular pipe exposing Publisher values to `@for`. */
import {
    ChangeDetectorRef,
    ErrorHandler,
    Pipe,
    inject,
    type OnDestroy,
    type PipeTransform
} from "@angular/core";
import type {Publisher} from "reactor-core-ts";
import type {PublisherKeySelector, PublisherRenderMode} from "@/shared/types.js";
import {PublisherBinding} from "@/angular/publisher-binding.js";
import {PublisherFailureHandler} from "@/angular/publisher-failure-handler.js";

/** Subscribes to a Publisher and returns its reconciled immutable value array. */
@Pipe({name: "publisherValues", standalone: true, pure: false})
export class PublisherValuesPipe implements PipeTransform, OnDestroy {
    /** Angular change detector invalidated by asynchronous signals. */
    readonly #changeDetector = inject(ChangeDetectorRef);
    /** Angular error boundary. */
    readonly #errorHandler = inject(ErrorHandler);
    /** Deduplicated Publisher failure reporter. */
    readonly #failureHandler = new PublisherFailureHandler(this.#errorHandler);
    /** Publisher lifecycle binding. */
    readonly #binding = new PublisherBinding<unknown>(() => this.#changeDetector.markForCheck());
    /** Last materialized snapshot revision. */
    #revision = -1;
    /** Cached values avoiding allocations during unchanged checks. */
    #values: readonly unknown[] = [];

    /**
     * Connects the pipe to a Publisher.
     *
     * @param source - Publisher of values or authoritative arrays.
     * @param keyBy - Optional application reconciliation key.
     * @param mode - Append, latest, or snapshot behavior.
     * @returns Current immutable ordered values.
     */
    transform<T>(
        source: Publisher<T | readonly T[]>,
        keyBy?: PublisherKeySelector<T>,
        mode: PublisherRenderMode = "append"
    ): readonly T[] {
        this.#binding.connect(
            source as Publisher<unknown | readonly unknown[]>,
            mode,
            keyBy as PublisherKeySelector<unknown> | undefined
        );
        const snapshot = this.#binding.snapshot;
        this.#failureHandler.report(snapshot);
        if (snapshot.revision !== this.#revision) {
            this.#revision = snapshot.revision;
            this.#values = snapshot.entries.map(entry => entry.value);
        }
        return this.#values as readonly T[];
    }

    /** Cancels the active subscription. */
    ngOnDestroy(): void {
        this.#binding.disconnect();
    }
}
