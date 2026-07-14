/** Shared validation for HTML hosts that cannot contain Publisher bindings. */

/** Throws a focused error when a Publisher is rendered inside a text-only host. */
export function assertPublisherHostSupported(unsupportedHost?: string): void {
    if (unsupportedHost) {
        throw new TypeError(
            `Publisher JSX children are not supported inside <${unsupportedHost}>; ` +
            "bind a framework value API instead"
        );
    }
}
