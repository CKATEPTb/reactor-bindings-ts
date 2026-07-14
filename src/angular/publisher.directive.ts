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
import type {PublisherValue} from "@/shared/publisher-value.js";
import type {
    PublisherEntry,
    PublisherKey,
    PublisherKeySelector,
    PublisherRenderMode
} from "@/shared/types.js";
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

/** Extracts the rendered value for the directive's selected reconciliation mode. */
export type PublisherDirectiveItem<
    Source extends Publisher<unknown> | "",
    Mode extends PublisherRenderMode = "append"
> = Mode extends "snapshot"
    ? PublisherValue<Extract<Source, Publisher<unknown>>> extends readonly (infer Item)[]
        ? Item
        : never
    : PublisherValue<Extract<Source, Publisher<unknown>>>;

/** Selects the bound `from` Publisher, falling back to the concise primary input. */
type PublisherDirectiveSource<
    Primary extends Publisher<unknown> | "",
    From extends Publisher<unknown> | undefined
> = [Extract<From, Publisher<unknown>>] extends [never]
    ? Extract<Primary, Publisher<unknown>>
    : [Primary] extends [""]
        ? Extract<From, Publisher<unknown>>
        : Extract<Primary, Publisher<unknown>>;

/** Rendered item inferred from both structural input forms and their mode. */
type PublisherDirectiveBoundItem<
    Primary extends Publisher<unknown> | "",
    From extends Publisher<unknown> | undefined,
    Mode extends PublisherRenderMode
> = PublisherDirectiveItem<PublisherDirectiveSource<Primary, From>, Mode>;

/** Retained Angular view and the entry snapshot it last rendered. */
interface PublisherViewState<T> {
    /** Embedded view owned by the directive. */
    readonly view: EmbeddedViewRef<PublisherContext<T>>;
    /** Immutable entry identity used to detect every upstream update. */
    entry: PublisherEntry<T>;
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
export class PublisherDirective<
    Primary extends Publisher<unknown> | "" = Publisher<unknown>,
    From extends Publisher<unknown> | undefined = undefined,
    Mode extends PublisherRenderMode = "append"
> implements OnChanges, OnDestroy {
    /** Publisher supplied through the concise `[publisher]` form. */
    @Input() publisher!: Primary;
    /** Publisher supplied by structural-directive `from` microsyntax. */
    @Input() publisherFrom!: From;
    /** Append, latest, or authoritative snapshot behavior. */
    @Input() publisherMode: Mode = "append" as Mode;
    /** Optional stable application key selector. */
    @Input() publisherKeyBy: PublisherKeySelector<
        PublisherDirectiveBoundItem<Primary, From, Mode>
    > | undefined;

    /** Host view container. */
    readonly #container = inject(ViewContainerRef);
    /** Embedded template instantiated per value. */
    readonly #template = inject<TemplateRef<PublisherContext<
        PublisherDirectiveBoundItem<Primary, From, Mode>
    >>>(TemplateRef);
    /** Angular error boundary. */
    readonly #errorHandler = inject(ErrorHandler);
    /** Deduplicated Publisher failure reporter. */
    readonly #failureHandler = new PublisherFailureHandler(this.#errorHandler);
    /** Views indexed by framework-safe shared-store identity. */
    readonly #views = new Map<number, PublisherViewState<
        PublisherDirectiveBoundItem<Primary, From, Mode>
    >>();
    /** Entry identities in the same order as the view container. */
    #order: readonly number[] = [];
    /** Publisher lifecycle binding. */
    readonly #binding = new PublisherBinding<
        PublisherDirectiveBoundItem<Primary, From, Mode>
    >(
        () => this.#render()
    );
    /** Reconnects when a structural directive input changes. */
    ngOnChanges(): void {
        const concise = this.publisher as Primary | undefined;
        const source = this.publisherFrom ?? (concise === "" ? undefined : concise);
        if (!source) {
            this.#binding.disconnect();
            this.#clearViews();
            return;
        }
        this.#binding.connect(
            source as Publisher<
                PublisherDirectiveBoundItem<Primary, From, Mode> |
                readonly PublisherDirectiveBoundItem<Primary, From, Mode>[]
            >,
            this.publisherMode,
            this.publisherKeyBy
        );
        this.#render();
    }

    /** Cancels upstream and destroys retained views. */
    ngOnDestroy(): void {
        this.#binding.disconnect();
        this.#clearViews();
    }

    /** Tells Angular's template checker which variables the directive exposes. */
    static ngTemplateContextGuard<
        Primary extends Publisher<unknown> | "",
        From extends Publisher<unknown> | undefined,
        Mode extends PublisherRenderMode
    >(
        _directive: PublisherDirective<Primary, From, Mode>,
        _context: unknown
    ): _context is PublisherContext<PublisherDirectiveBoundItem<Primary, From, Mode>> {
        return true;
    }

    /** Applies one immutable snapshot to Angular embedded views. */
    #render(): void {
        const snapshot = this.#binding.snapshot;
        this.#failureHandler.report(snapshot);
        const entries = snapshot.entries;
        const count = entries.length;
        const nextOrder = new Array<number>(count);
        const retained = new Set<number>();
        const changedViews: EmbeddedViewRef<
            PublisherContext<PublisherDirectiveBoundItem<Primary, From, Mode>>
        >[] = [];
        for (let index = 0; index < count; index += 1) {
            const id = entries[index]!.id;
            nextOrder[index] = id;
            retained.add(id);
        }
        for (let index = this.#order.length - 1; index >= 0; index -= 1) {
            const id = this.#order[index]!;
            if (!retained.has(id)) {
                this.#container.remove(index);
                this.#views.delete(id);
            }
        }
        for (let index = 0; index < count; index += 1) {
            const entry = entries[index]!;
            const state = this.#views.get(entry.id);
            let view: EmbeddedViewRef<PublisherContext<
                PublisherDirectiveBoundItem<Primary, From, Mode>
            >>;
            let changed = true;
            if (!state) {
                view = this.#container.createEmbeddedView(
                    this.#template,
                    createContext(entry.value, index, count, entry.key),
                    {index}
                );
                this.#views.set(entry.id, {view, entry});
                changed = true;
            } else {
                view = state.view;
                changed = state.entry !== entry ||
                    contextChanged(view.context, entry.value, index, count, entry.key);
                updateContext(view.context, entry.value, index, count, entry.key);
                state.entry = entry;
                if (this.#container.get(index) !== view) {
                    this.#container.move(view, index);
                }
            }
            if (changed) {
                changedViews.push(view);
            }
        }
        this.#order = nextOrder;
        for (const view of changedViews) {
            view.detectChanges();
        }
    }

    /** Destroys every retained embedded view. */
    #clearViews(): void {
        this.#container.clear();
        this.#views.clear();
        this.#order = [];
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
