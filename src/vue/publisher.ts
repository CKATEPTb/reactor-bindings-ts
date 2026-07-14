/** Vue template component for Publisher values. */
import {Fragment, defineComponent, h, type PropType, type VNodeChild} from "vue";
import type {Publisher as ReactorPublisher} from "reactor-core-ts";
import type {PublisherKey, PublisherKeySelector, PublisherRenderMode} from "@/shared/types.js";
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
export const Publisher = defineComponent({
    name: "Publisher",
    props: {
        source: {
            type: Object as PropType<ReactorPublisher<unknown | readonly unknown[]>>,
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
