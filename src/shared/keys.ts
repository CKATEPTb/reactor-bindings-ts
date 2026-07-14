/** Shared identities used by every framework reconciliation adapter. */
import type {PublisherKey} from "@/shared/types.js";

/** Singleton identity used by latest-value rendering mode. */
const LATEST_PUBLISHER_KEY = Symbol("Publisher.latest");
/** Selector sentinel requesting a private unique append identity. */
const UNKEYED_PUBLISHER_KEY = Symbol("Publisher.unkeyed");

/** Returns the singleton key used to update one latest-value slot. */
export function latestPublisherKey<T>(_value: T): PublisherKey {
    return LATEST_PUBLISHER_KEY;
}

/** Requests a unique append identity without retaining an unused Map key. */
export function unkeyedPublisherKey<T>(_value: T): PublisherKey {
    return UNKEYED_PUBLISHER_KEY;
}

/** Returns whether a selector requested an unkeyed append identity. */
export function isUnkeyedPublisherKey(key: PublisherKey): boolean {
    return key === UNKEYED_PUBLISHER_KEY;
}
