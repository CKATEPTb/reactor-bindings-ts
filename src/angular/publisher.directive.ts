/** Angular structural directive for Publisher-backed embedded views. */
import {
    Directive,
    EmbeddedViewRef,
    ErrorHandler,
    Input,
    TemplateRef,
    ViewContainerRef,
    inject,
    type OnChanges,
    type OnDestroy
} from "@angular/core";
import type {Publisher} from "reactor-core-ts";
import type {PublisherKey, PublisherKeySelector, PublisherRenderMode} from "@/shared/types.js";
import {PublisherBinding} from "@/angular/publisher-binding.js";
import {PublisherFailureHandler} from "@/angular/publisher-failure-handler.js";

/** Template variables exposed by `*publisher`. */
export interface PublisherContext<T> {
    /** Implicit emitted value. */
    $implicit: T;
    /** Named alias for the emitted value. */
    publisher: T;
    /** Current ordered position. */
    index: number;
    /** Current number of rendered entries. */
    count: number;
    /** Application reconciliation key. */
    key: PublisherKey;
}

/**
 * Renders one embedded view for every reconciled Publisher entry.
 *
 * @example
 * ```html
 * <li *publisher="let user from users; keyBy: userKey">
 *   {{ user.name }}
 * </li>
 * ```
 */
@Directive({selector: "[publisher]", standalone: true})
export class PublisherDirective<T> implements OnChanges, OnDestroy {
    /** Publisher supplied through the concise `[publisher]` form. */
    @Input() publisher: Publisher<T | readonly T[]> | undefined;
    /** Publisher supplied by structural-directive `from` microsyntax. */
    @Input() publisherFrom: Publisher<T | readonly T[]> | undefined;
    /** Append, latest, or authoritative snapshot behavior. */
    @Input() publisherMode: PublisherRenderMode = "append";
    /** Optional stable application key selector. */
    @Input() publisherKeyBy: PublisherKeySelector<T> | undefined;

    /** Host view container. */
    readonly #container = inject(ViewContainerRef);
    /** Embedded template instantiated per value. */
    readonly #template = inject<TemplateRef<PublisherContext<T>>>(TemplateRef);
    /** Angular error boundary. */
    readonly #errorHandler = inject(ErrorHandler);
    /** Deduplicated Publisher failure reporter. */
    readonly #failureHandler = new PublisherFailureHandler(this.#errorHandler);
    /** Views indexed by framework-safe shared-store identity. */
    readonly #views = new Map<number, EmbeddedViewRef<PublisherContext<T>>>();
    /** Publisher lifecycle binding. */
    readonly #binding = new PublisherBinding<T>(() => this.#render());
    /** Reconnects when a structural directive input changes. */
    ngOnChanges(): void {
        const source = this.publisherFrom ?? this.publisher;
        if (!source) {
            this.#binding.disconnect();
            this.#clearViews();
            return;
        }
        this.#binding.connect(source, this.publisherMode, this.publisherKeyBy);
        this.#render();
    }

    /** Cancels upstream and destroys retained views. */
    ngOnDestroy(): void {
        this.#binding.disconnect();
        this.#clearViews();
    }

    /** Tells Angular's template checker which variables the directive exposes. */
    static ngTemplateContextGuard<T>(
        _directive: PublisherDirective<T>,
        _context: unknown
    ): _context is PublisherContext<T> {
        return true;
    }

    /** Applies one immutable snapshot to Angular embedded views. */
    #render(): void {
        const snapshot = this.#binding.snapshot;
        this.#failureHandler.report(snapshot);
        const retained = new Set(snapshot.entries.map(entry => entry.id));
        for (const [id, view] of this.#views) {
            if (!retained.has(id)) {
                const index = this.#container.indexOf(view);
                if (index >= 0) {
                    this.#container.remove(index);
                }
                this.#views.delete(id);
            }
        }
        const count = snapshot.entries.length;
        snapshot.entries.forEach((entry, index) => {
            let view = this.#views.get(entry.id);
            if (!view) {
                view = this.#container.createEmbeddedView(
                    this.#template,
                    createContext(entry.value, index, count, entry.key),
                    {index}
                );
                this.#views.set(entry.id, view);
            } else {
                const changed = contextChanged(view.context, entry.value, index, count, entry.key);
                updateContext(view.context, entry.value, index, count, entry.key);
                if (this.#container.indexOf(view) !== index) {
                    this.#container.move(view, index);
                }
                if (!changed) {
                    return;
                }
            }
            view.detectChanges();
        });
    }

    /** Destroys every retained embedded view. */
    #clearViews(): void {
        this.#container.clear();
        this.#views.clear();
    }
}

/** Creates one mutable Angular template context. */
function createContext<T>(
    value: T,
    index: number,
    count: number,
    key: PublisherKey
): PublisherContext<T> {
    return {$implicit: value, publisher: value, index, count, key};
}

/** Updates a retained view context without replacing the view. */
function updateContext<T>(
    context: PublisherContext<T>,
    value: T,
    index: number,
    count: number,
    key: PublisherKey
): void {
    context.$implicit = value;
    context.publisher = value;
    context.index = index;
    context.count = count;
    context.key = key;
}

/** Returns whether an existing embedded view has observable context changes. */
function contextChanged<T>(
    context: PublisherContext<T>,
    value: T,
    index: number,
    count: number,
    key: PublisherKey
): boolean {
    return !Object.is(context.$implicit, value) ||
        context.index !== index ||
        context.count !== count ||
        !Object.is(context.key, key);
}
