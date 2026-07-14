/** Shared identities used by every framework reconciliation adapter. */
import type {PublisherKey} from "@/shared/types.js";

/** Singleton identity used by latest-value rendering mode. */
const LATEST_PUBLISHER_KEY = Symbol("Publisher.latest");

/** Returns the singleton key used to update one latest-value slot. */
export function latestPublisherKey<T>(_value: T): PublisherKey {
    return LATEST_PUBLISHER_KEY;
}
