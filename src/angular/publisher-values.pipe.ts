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
import type {
    PublisherKeySelector,
    PublisherRenderMode,
    PublisherSnapshot
} from "@/shared/types.js";
import {PublisherBinding} from "@/angular/publisher-binding.js";
import {PublisherFailureHandler} from "@/angular/publisher-failure-handler.js";
import type {PublisherSnapshotItem, PublisherValue} from "@/shared/publisher-value.js";

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
    /** Last materialized snapshot identity. */
    #snapshot: PublisherSnapshot<unknown> | undefined;
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
    transform<Source extends Publisher<unknown>>(
        source: Source,
        keyBy?: PublisherKeySelector<PublisherValue<Source>>,
        mode?: "append" | "latest"
    ): readonly PublisherValue<Source>[];
    /** Connects the pipe to an authoritative array Publisher. */
    transform<Source extends Publisher<readonly unknown[]>>(
        source: Source,
        keyBy: PublisherKeySelector<PublisherSnapshotItem<Source>> | undefined,
        mode: "snapshot"
    ): readonly PublisherSnapshotItem<Source>[];
    /** Implements item and authoritative snapshot overloads. */
    transform(
        source: Publisher<unknown | readonly unknown[]>,
        keyBy?: PublisherKeySelector<never>,
        mode: PublisherRenderMode = "append"
    ): readonly unknown[] {
        this.#binding.connect(
            source,
            mode,
            keyBy as PublisherKeySelector<unknown> | undefined
        );
        const snapshot = this.#binding.snapshot;
        this.#failureHandler.report(snapshot);
        if (snapshot !== this.#snapshot) {
            this.#snapshot = snapshot;
            this.#values = snapshot.entries.map(entry => entry.value);
        }
        return this.#values;
    }

    /** Cancels the active subscription. */
    ngOnDestroy(): void {
        this.#binding.disconnect();
    }
}
