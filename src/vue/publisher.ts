/** Vue template component for Publisher values. */
import {
    Fragment,
    defineComponent,
    h,
    type ComponentPublicInstance,
    type PropType,
    type PublicProps,
    type VNodeChild
} from "vue";
import type {Publisher as ReactorPublisher} from "reactor-core-ts";
import type {PublisherKey, PublisherKeySelector, PublisherRenderMode} from "@/shared/types.js";
import type {PublisherValue} from "@/shared/publisher-value.js";
import {usePublisherSnapshot} from "@/vue/use-publisher-values.js";

/** Slot bindings exposed by the Vue template component. */
export interface PublisherSlot<T> {
    /** Current reconciled value. */
    readonly value: T;
    /** Current ordered position. */
    readonly index: number;
    /** Application reconciliation key. */
    readonly key: PublisherKey;
}

/** Type-safe props for append/latest item Publishers. */
export interface PublisherItemProps<T> {
    /** Item-emitting Publisher. */
    readonly source: ReactorPublisher<T>;
    /** Append by default or retain one latest value. */
    readonly mode?: "append" | "latest";
    /** Optional stable application key selector. */
    readonly keyBy?: PublisherKeySelector<T>;
}

/** Type-safe props for authoritative array Publishers. */
export interface PublisherSnapshotProps<T> {
    /** Array-emitting Publisher. */
    readonly source: ReactorPublisher<readonly T[]>;
    /** Selects authoritative snapshot reconciliation. */
    readonly mode: "snapshot";
    /** Optional stable application key selector. */
    readonly keyBy?: PublisherKeySelector<T>;
}

/** Generic Vue Publisher component props. */
export type PublisherProps<T> = PublisherItemProps<T> | PublisherSnapshotProps<T>;

/** Retains the concrete Publisher subtype used for generic inference. */
interface ConcretePublisherSource<Source extends ReactorPublisher<any>> {
    /** Concrete item or array Publisher. */
    readonly source: Source;
}

/** Derives discriminated component props directly from a concrete Publisher type. */
type PublisherSourceProps<Source extends ReactorPublisher<any>> =
    | (Omit<PublisherItemProps<PublisherValue<Source>>, "source"> & ConcretePublisherSource<Source>)
    | (PublisherValue<Source> extends readonly (infer T)[]
        ? Omit<PublisherSnapshotProps<T>, "source"> & ConcretePublisherSource<Source>
        : never);

/** Derives possible slot values from item and snapshot modes. */
type PublisherSourceValue<Source extends ReactorPublisher<any>> =
    PublisherValue<Source> extends readonly (infer T)[]
        ? PublisherValue<Source> | T
        : PublisherValue<Source>;

/** Generic Vue component facade preserving source, selector, and slot value types. */
export interface PublisherComponent {
    /** Provides generic props and slots to Vue template tooling. */
    new <Source extends ReactorPublisher<any>>(
        props: PublisherSourceProps<Source> & PublicProps
    ): ComponentPublicInstance<PublisherSourceProps<Source>> & {
        /** Scoped slot inferred from the Publisher item type. */
        readonly $slots: {
            /** Renders one reconciled Publisher entry. */
            readonly default?: (slot: PublisherSlot<PublisherSourceValue<Source>>) => VNodeChild;
        };
    };
}

/**
 * Renders Publisher values through Vue's default scoped slot.
 *
 * @example
 * ```vue
 * <Publisher :source="users" :key-by="user => user.id" v-slot="{ value: user }">
 *   <li>{{ user.name }}</li>
 * </Publisher>
 * ```
 */
const PublisherRuntime = defineComponent({
    name: "Publisher",
    props: {
        source: {
            type: null as unknown as PropType<ReactorPublisher<unknown | readonly unknown[]>>,
            required: true
        },
        mode: {
            type: String as PropType<PublisherRenderMode>,
            default: "append"
        },
        keyBy: Function as PropType<PublisherKeySelector<unknown>>
    },
    setup(props, {slots}) {
        const snapshot = usePublisherSnapshot(
            () => props.source,
            () => props.mode,
            () => props.keyBy
        );
        return (): VNodeChild => {
            const current = snapshot.value;
            if (current.failure) {
                throw current.failure.error;
            }
            const slot = slots.default;
            if (!slot) {
                return [];
            }
            return current.entries.map((entry, index) => h(
                Fragment,
                {key: entry.id},
                slot({value: entry.value, index, key: entry.key})
            ));
        };
    }
});

/** Generic Vue template component for item and authoritative array Publishers. */
export const Publisher = PublisherRuntime as unknown as PublisherComponent;
