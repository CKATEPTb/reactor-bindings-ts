/** Deduplicated Angular error-boundary reporting for Publisher snapshots. */
import type {ErrorHandler} from "@angular/core";
import type {PublisherSnapshot} from "@/shared/types.js";

/** Reports each immutable failure box to Angular exactly once. */
export class PublisherFailureHandler {
    /** Last reported immutable failure box. */
    #reportedFailure: PublisherSnapshot<unknown>["failure"];

    /** Creates a reporter backed by Angular's active error handler. */
    constructor(readonly errorHandler: ErrorHandler) {}

    /** Reports a new failure or resets deduplication after recovery. */
    report(snapshot: PublisherSnapshot<unknown>): void {
        const failure = snapshot.failure;
        if (!failure) {
            this.#reportedFailure = undefined;
            return;
        }
        if (failure === this.#reportedFailure) {
            return;
        }
        this.#reportedFailure = failure;
        this.errorHandler.handleError(failure.error);
    }
}
