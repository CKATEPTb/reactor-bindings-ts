/** Solid owner validation for compiler-injected runtime components. */
import {getOwner, type Owner} from "solid-js";

/** Returns the current Solid owner or throws a component-specific error. */
export function requireSolidOwner(componentName: string): Owner {
    const owner = getOwner();
    if (!owner) {
        throw new Error(`${componentName} must be created inside a Solid owner`);
    }
    return owner;
}
