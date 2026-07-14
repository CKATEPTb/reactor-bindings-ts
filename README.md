# reactor-bindings-ts

Render `Publisher`, `Flux`, and `Mono` values from
[`reactor-core-ts`](https://www.npmjs.com/package/reactor-core-ts) directly in
Solid, React, Preact, Vue, and Angular.

```tsx
import {Flux} from "reactor-core-ts";

const numbers = Flux.range(1, 10).delayElements(250);

export function NumberStream() {
    return (
        <>
            <p>Every value: {numbers}</p>
            <p>Latest value: {numbers!}</p>
        </>
    );
}
```

## Table of contents

- [What it is](#what-it-is)
- [Why it exists](#why-it-exists)
- [Compatibility](#compatibility)
- [Rendering model](#rendering-model)
- [Framework setup](#framework-setup)
  - [Solid](#solid)
  - [React](#react)
  - [Preact](#preact)
  - [Vue](#vue)
  - [Angular](#angular)
- [Lifecycle, errors, and SSR](#lifecycle-errors-and-ssr)
- [Performance and design](#performance-and-design)
- [Troubleshooting](#troubleshooting)
- [Package entry points](#package-entry-points)
- [Development](#development)
- [Publishing](#publishing)
- [License](#license)

## What it is

`reactor-bindings-ts` is the rendering layer between Reactive Streams and UI
frameworks. It provides two kinds of integration:

- a shared Publisher-aware JSX transform for Solid, React, Preact, and Vue;
- native template APIs for Vue and Angular.

The JSX transform recognizes Publisher expressions and generates small
framework adapters that own the subscription and rendered entries. Vue
templates use a scoped-slot component or composable. Angular templates use a
structural directive or pipes.

All integrations follow the same list semantics while retaining
framework-specific rendering primitives: Solid roots and stores, React and
Preact external-store snapshots, Vue refs and components, and Angular embedded
views.

## Why it exists

UI frameworks do not know what a Reactive Streams `Publisher` means. To a
renderer, a `Flux` is just an object: it does not know whether emissions should
be appended, replace one value, update a keyed record, or describe an entire
list. Rendering a Publisher without an integration can therefore produce an
invalid-child error or a warning such as `Unrecognized value. Skipped
inserting Flux`.

Handling this manually requires every component to repeat the same work:

1. subscribe when the view mounts;
2. store each signal in framework state;
3. choose append, latest-value, or snapshot behavior;
4. preserve keyed renderer identity;
5. propagate failures through the framework;
6. cancel the subscription when the view is replaced or destroyed.

This package centralizes those rules. Application code stays declarative and
continues composing `Flux` and `Mono` with normal Reactor operators.

## Compatibility

| Dependency | Supported versions |
| --- | --- |
| Node.js | 20.19 or newer |
| `reactor-core-ts` | 3.2.4 or newer |
| Solid | 1.9 |
| React | 18 or 19 |
| Preact | 10 |
| Vue | 3.5 |
| Angular | 21 or 22 |
| Vite for JSX integrations | 6, 7, or 8 |
| Babel | 7 |

Framework and build-tool peer dependencies are optional at the package level
so that an Angular application does not install React, for example. Install
the dependencies listed in the relevant framework section below.

## Rendering model

Solid, React, Preact, and Vue TSX share the following syntax:

| JSX expression | Meaning | Can remove old entries? |
| --- | --- | --- |
| `{source}` | Append every emitted renderable value | No |
| `{source!}` | Keep one slot containing the latest value | Not applicable |
| `{source.map(render)}` | Append each mapped result | No |
| `{source.map(value => <li r-key={...}>...</li>)}` | Incremental keyed upsert | No |
| `{sourceOfArrays.map(list => list.map(render))}` | Authoritative list snapshot | Yes |

Vue and Angular templates expose the same behavior through an explicit `mode`:
`"append"`, `"latest"`, or `"snapshot"`.

### Append by default

A Publisher used directly as a JSX child is an event stream. Every emission
creates another rendered entry, so an identity `map` is unnecessary:

```tsx
const numbers = Flux.range(0, 100).delayElements(1000);

<p>Count is {numbers}</p>
```

Strings, numbers, elements, and other framework-renderable values can be
emitted directly. Plain records are not valid UI children; map them to text or
JSX:

```tsx
const userUpdates = Flux.from(userPublisher);

<span>{userUpdates.map(user => user.name)}</span>
```

JSX integrations also find Publishers recursively inside ordinary arrays, so
expressions such as `{["Status: ", statusUpdates]}` bind the nested Publisher
without turning the surrounding array into a stream.

Completion keeps the values already rendered. It does not clear the view.

### Latest-value mode with `!`

Inside a TSX child expression, TypeScript's non-null assertion is also a
compiler marker. The first emission creates a slot and later emissions update
that slot:

```tsx
<span>{numbers!}</span>
<span>{numbers.map(number => number + 1)!}</span>
```

The marker may appear anywhere in the outer Publisher call/member chain:

```tsx
<span>
    {Flux.range(0, 300)!.delayElements(100).map(value => value + 1)}
</span>
```

The transform removes outer-chain markers before evaluating the Publisher. An
assertion inside a callback remains an ordinary TypeScript assertion:

```tsx
<span>{users.map(user => user!.name)}</span>
```

Outside a JSX child, `!` always has its normal TypeScript meaning. JavaScript
`.jsx` cannot use this shorthand; use the framework hook, component, directive,
or pipe with `mode: "latest"` instead.

### Incremental keyed updates

Put `r-key` on the root JSX element returned by the Publisher mapper:

`r-key` is reserved for Publisher reconciliation, so native framework `key`
attributes remain available for their usual rendering semantics.

```tsx
<ul>
    {users.map(user => (
        <li r-key={user.id}>{user.name} {user.age}</li>
    ))}
</ul>
```

An incremental stream follows these rules:

- an unseen `r-key` appends a new entry;
- an existing `r-key` updates the retained framework entry;
- an update does not move the `r-key`;
- a missing `r-key` never implies deletion;
- without an `r-key`, every emission appends a new entry.

The compiler consumes the root `r-key` for Publisher reconciliation. Compatible
updates can reuse the existing framework view or DOM, but changing the root
element or value shape may require replacement. A key identifies logical
state; it is not an unconditional promise that every DOM node remains the same.

### Authoritative list snapshots

Deletion and reordering require a Publisher that emits the complete current
array. A nested `map` tells the JSX transform that each array is authoritative:

```tsx
const users = Flux.from(userEvents).collectList();

<ul>
    {users.map(list =>
        list.map(user => (
            <li r-key={user.id}>{user.name} {user.age}</li>
        ))
    )}
</ul>
```

Each snapshot adds unseen `r-key` values, updates retained entries, removes omitted entries,
and reorders entries to match the emitted array. The binding does not sort the
array itself. Duplicate `r-key` values are errors. Without `r-key`, array indices provide
identity.

The inner mapper receives the same `(value, index, array)` arguments as native
`Array.map`. The outer snapshot callback must return `list.map(...)` directly;
put preprocessing upstream or inside the inner mapper so the compiler does not
have to lift local state out of scope.

`collectList()` emits one complete array after its upstream completes. A live
list that needs repeated deletion or reordering should use a Publisher that
emits repeated complete arrays with the same nested-map shape.

### Nested Publishers inside `flatMap`

JSX returned directly from Reactor `flatMap` is wrapped lazily. `flatMap`
remains a real Reactor operator, while the active framework owns DOM creation:

```tsx
<ul>
    {onlineUserIdsFlux.flatMap(userId => (
        <li r-key={userId}>
            {getUserAndFutureUpdates(userId)!.map(user => user.name)}
        </li>
    ))}
</ul>
```

The root `r-key` controls upserts in the outer list. The nested `!` maintains one
latest-value slot inside that entry. A `flatMap` result may be stored when all
of its consumers render it directly, but its callback must return JSX directly,
either with a concise body or one top-level `return` statement. Put fluent
operators before `flatMap`; values after it are reserved for lazy rendering.

## Framework setup

The commands below are self-contained for each framework. Omit dependencies
already provided by an existing application.

### Solid

#### Install

```sh
npm install reactor-bindings-ts reactor-core-ts solid-js
npm install --save-dev typescript vite vite-plugin-solid @babel/core
```

#### Configure

Use the combined Vite integration. It already installs `vite-plugin-solid`, so
do not add `solid()` a second time:

```ts
// vite.config.ts
import {defineConfig} from "vite";
import reactorSolid from "reactor-bindings-ts/solid/vite";

export default defineConfig({
    plugins: [reactorSolid()]
});
```

Select the Publisher-aware Solid JSX types:

```json
{
  "compilerOptions": {
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "jsxImportSource": "reactor-bindings-ts/solid"
  }
}
```

Both settings are required: `jsxImportSource` supplies types and the JSX
runtime, while the Vite integration transforms Publisher expressions.

#### Use

```tsx
import {Flux} from "reactor-core-ts";

const users = Flux.just(
    {id: 1, name: "Ada"},
    {id: 1, name: "Ada Lovelace"},
    {id: 2, name: "Grace"}
);

export function Users() {
    return (
        <ul>
            {users.map(user => <li r-key={user.id}>{user.name}</li>)}
        </ul>
    );
}
```

Solid owns a reactive root for each retained entry. Records and arrays reconcile
through Solid stores; primitives and lazy entries use signals. For a retained
key, keep the value shape compatible: switching between a record, array, and
primitive is an error.

### React

#### Install

```sh
npm install reactor-bindings-ts reactor-core-ts react react-dom
npm install --save-dev typescript vite @vitejs/plugin-react @babel/core @types/react @types/react-dom
```

#### Configure

`reactorReact()` already includes the official React Vite plugin:

```ts
// vite.config.ts
import {defineConfig} from "vite";
import reactorReact from "reactor-bindings-ts/react/vite";

export default defineConfig({
    plugins: [reactorReact()]
});
```

```json
{
  "compilerOptions": {
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "reactor-bindings-ts/react"
  }
}
```

Do not register `@vitejs/plugin-react` separately, and keep both the Vite and
TypeScript settings above.

#### Use JSX

```tsx
import {Flux} from "reactor-core-ts";

interface User {
    id: number;
    name: string;
}

const userEvents = Flux.just(
    {id: 1, name: "Ada"},
    {id: 1, name: "Ada Lovelace"}
);

export function Users() {
    return (
        <ul>
            {userEvents.map(user => (
                <li r-key={user.id}>{user.name}</li>
            ))}
        </ul>
    );
}
```

#### Use the hook

Non-JSX integration is available through `usePublisherValues`:

```tsx
import type {Publisher} from "reactor-core-ts";
import {usePublisherValues} from "reactor-bindings-ts/react";

interface User {
    id: number;
    name: string;
}

const userKey = (user: User) => user.id;

export function Users({source}: {source: Publisher<User>}) {
    const users = usePublisherValues(source, {keyBy: userKey});
    return <ul>{users.map(user => <li key={user.id}>{user.name}</li>)}</ul>;
}
```

Hook options are `mode: "append" | "latest" | "snapshot"` and `keyBy`. Keep
`source` stable when it represents the same stream. Changing `keyBy` updates
reconciliation after commit without restarting that Publisher.

### Preact

#### Install

```sh
npm install reactor-bindings-ts reactor-core-ts preact
npm install --save-dev typescript vite @preact/preset-vite @babel/core
```

#### Configure

`reactorPreact()` already includes `@preact/preset-vite`:

```ts
// vite.config.ts
import {defineConfig} from "vite";
import reactorPreact from "reactor-bindings-ts/preact/vite";

export default defineConfig({
    plugins: [reactorPreact()]
});
```

```json
{
  "compilerOptions": {
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "reactor-bindings-ts/preact"
  }
}
```

Do not register the Preact preset twice. Preact TSX supports direct Publishers,
`!`, root `r-key` attributes, snapshots, and nested `flatMap` exactly as described in the
rendering model.

#### Use the hook

```tsx
import type {Publisher} from "reactor-core-ts";
import {usePublisherValues} from "reactor-bindings-ts/preact";

interface User {
    id: number;
    name: string;
}

const userKey = (user: User) => user.id;

export function Users({source}: {source: Publisher<User>}) {
    const users = usePublisherValues(source, {keyBy: userKey});
    return <ul>{users.map(user => <li key={user.id}>{user.name}</li>)}</ul>;
}
```

The hook accepts the same `mode` and `keyBy` options as React. Use a stable
selector rather than creating `keyBy` inline during every render.

### Vue

Vue templates and Vue TSX have separate setup paths.

#### Vue templates: install

```sh
npm install reactor-bindings-ts reactor-core-ts vue
```

No Babel or Publisher JSX plugin is needed for template-only usage. Keep the
normal Vue/SFC tooling already configured by the application.

#### Vue templates: use the component

```vue
<script setup lang="ts">
import {Flux} from "reactor-core-ts";
import {Publisher} from "reactor-bindings-ts/vue";

interface User {
    id: number;
    name: string;
    age: number;
}

const users = Flux.just(
    {id: 1, name: "Ada", age: 36},
    {id: 1, name: "Ada Lovelace", age: 37}
);
const userKey = (user: User) => user.id;
</script>

<template>
  <ul>
    <Publisher
      :source="users"
      :key-by="userKey"
      v-slot="{ value: user, index }"
    >
      <li>{{ index + 1 }}. {{ user.name }} {{ user.age }}</li>
    </Publisher>
  </ul>
</template>
```

The component accepts:

| Prop | Meaning |
| --- | --- |
| `source` | A `Publisher<T>` or, in snapshot mode, `Publisher<readonly T[]>` |
| `mode` | `"append"` by default; also `"latest"` and `"snapshot"` |
| `keyBy` | Stable application key selector |

The slot exposes `value`, `index`, and `key`. In templates, reconciliation keys
come from `keyBy`, not from a `:key` inside the scoped slot.

Latest-value mode:

```vue
<Publisher :source="statusUpdates" mode="latest" v-slot="{ value: status }">
  <span>{{ status }}</span>
</Publisher>
```

Snapshot mode:

```vue
<Publisher
  :source="userSnapshots"
  mode="snapshot"
  :key-by="userKey"
  v-slot="{ value: user }"
>
  <li>{{ user.name }}</li>
</Publisher>
```

The composable accepts a Publisher, ref, computed ref, or getter and returns a
`ComputedRef<readonly T[]>`:

```ts
import {usePublisherValues} from "reactor-bindings-ts/vue";

const userKey = (user: User) => user.id;
const renderedUsers = usePublisherValues(() => props.users, {
    mode: "append",
    keyBy: userKey
});
```

#### Vue TSX: install

```sh
npm install reactor-bindings-ts reactor-core-ts vue
npm install --save-dev typescript vite @babel/core @vitejs/plugin-vue @vitejs/plugin-vue-jsx
```

#### Vue TSX: configure

The combined plugin installs the Publisher pre-transform and both official Vue
Vite plugins. Do not add `vue()` or `vueJsx()` separately:

```ts
// vite.config.ts
import {defineConfig} from "vite";
import reactorVue from "reactor-bindings-ts/vue/vite";

export default defineConfig({
    plugins: [reactorVue()]
});
```

```json
{
  "compilerOptions": {
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "jsxImportSource": "reactor-bindings-ts/vue"
  }
}
```

Publisher TSX transformation applies to separate `.tsx`/`.jsx` modules. Use
the component/composable API for normal Vue `<template>` blocks.

```tsx
import {Flux} from "reactor-core-ts";

const users = Flux.just(
    {id: 1, name: "Ada"},
    {id: 1, name: "Ada Lovelace"}
);

export function Users() {
    return (
        <ul>
            {users.map(user => <li r-key={user.id}>{user.name}</li>)}
        </ul>
    );
}
```

### Angular

#### Install

In an Angular 21 or 22 application:

```sh
npm install reactor-bindings-ts reactor-core-ts @angular/core
```

Angular uses native templates, so it does not require the Babel transform or a
framework-specific Vite plugin.

#### Import the standalone APIs

```ts
import {Component} from "@angular/core";
import {Flux} from "reactor-core-ts";
import {
    PublisherDirective,
    PublisherLatestPipe,
    PublisherValuesPipe
} from "reactor-bindings-ts/angular";

interface User {
    id: number;
    name: string;
}

@Component({
    selector: "app-users",
    standalone: true,
    imports: [PublisherDirective, PublisherLatestPipe, PublisherValuesPipe],
    templateUrl: "./users.component.html"
})
export class UsersComponent {
    readonly users = Flux.just<User>(
        {id: 1, name: "Ada"},
        {id: 1, name: "Ada Lovelace"}
    );
    readonly userSnapshots = Flux.just<readonly User[]>([
        {id: 1, name: "Ada"},
        {id: 2, name: "Grace"}
    ]);
    readonly countFlux = Flux.range(1, 10);
    readonly userKey = (user: User) => user.id;
}
```

#### Use the structural directive

The directive defaults to append/upsert mode:

```html
<ul>
  <li
    *publisher="
      let user from users;
      keyBy: userKey;
      let index = index;
      let count = count
    "
  >
    {{ index + 1 }}/{{ count }}: {{ user.name }}
  </li>
</ul>
```

Its context exposes `$implicit`, `publisher`, `index`, `count`, and `key`.
`keyBy` controls Publisher reconciliation; an Angular `track` expression does
not replace it.

Snapshot mode expects complete arrays:

```html
<ul>
  <li
    *publisher="
      let user from userSnapshots;
      keyBy: userKey;
      mode: 'snapshot'
    "
  >
    {{ user.name }}
  </li>
</ul>
```

#### Use the pipes

```html
<p>Latest count: {{ countFlux | publisherLatest }}</p>

@for (user of (users | publisherValues:userKey); track user.id) {
  <p>{{ user.name }}</p>
}

@for (
  user of (userSnapshots | publisherValues:userKey:'snapshot');
  track user.id
) {
  <p>{{ user.name }}</p>
}
```

`publisherLatest` returns `undefined` before the first emission. The argument
order of the values pipe is `source | publisherValues : keyBy : mode`, and its
default mode is `"append"`.

## Lifecycle, errors, and SSR

- A binding subscribes when its framework consumer mounts.
- Unmounting or destroying the consumer cancels the subscription.
- Changing an explicit source or mode replaces the old binding; late signals
  from the cancelled source are ignored.
- Solid, React, Preact, Vue, and Angular update a changed key selector without
  restarting the same Publisher. Existing incremental entries are re-keyed
  before the next emission.
- Remounting a cold Publisher subscribes again and may rerun its work.
- Publisher completion retains the last rendered state.
- Publisher failures, invalid snapshot values, duplicate snapshot keys, and
  render failures use the active framework's error mechanism. Angular reports
  through `ErrorHandler`; JSX integrations throw into framework handling.
- React and Preact server snapshots are empty because an arbitrary Publisher
  cannot be synchronously replayed. The client subscription fills the view
  after hydration.

Keep explicit `source` references stable when they represent the same stream.
Stable `keyBy` references still avoid unnecessary selector comparisons and make
the intended identity rule clearer, but a fresh selector alone does not restart
the Publisher in React, Preact, Vue, or Angular.

## Performance and design

- Keyed lookup uses a `Map` and is O(1).
- Reconciling a complete snapshot is O(n), including duplicate-key validation
  and ordering.
- Shared-store bindings in React, Preact, Vue, and Angular apply synchronous
  append bursts with one array copy and one framework notification; latest and
  snapshot modes apply only the final value from the same burst.
- Those bindings avoid an unused lookup map for unkeyed appends, and unchanged
  immutable snapshots do not trigger a framework update.
- Retained keys preserve framework renderer-entry identity and avoid rebuilding
  unrelated entries; compatible roots can reuse their existing DOM/view.
- Framework snapshots are cached and only change after a Publisher signal.
- Some hook-backed updates copy small immutable entry arrays, so the package
  does not claim that every complete update is O(1).
- Subscription cleanup is idempotent, and late signals from replaced bindings
  are ignored.
- The compiler leaves literals, native array operations, arithmetic, templates,
  and other provably ordinary expressions on the framework-native path.
- Ambiguous React, Preact, and Vue values receive one structural Publisher check
  without allocating a component for an ordinary value. Their native
  `map`/`flatMap` behavior is retained when they are not Publishers.

## Troubleshooting

### `Unrecognized value` or an invalid object child

The Publisher JSX transform is not running. Confirm that the framework's
`reactor-bindings-ts/*/vite` plugin is registered, that the file is `.tsx` or
`.jsx`, and that the development server was restarted after editing
`vite.config.ts`.

### Publisher is rejected by JSX types

Set the framework-specific `jsxImportSource` in the TypeScript configuration.
The Vite plugin performs the runtime transform; `jsxImportSource` provides the
matching types and JSX runtime. Both are required.

### A list never removes old entries

Incremental append/upsert mode never infers deletion. Emit complete arrays and
use the snapshot nested-map shape in JSX, `mode="snapshot"` in Vue, or
`mode: 'snapshot'` in Angular.

### A binding subscribes again after a render

Keep the Publisher reference stable; constructing a new cold Publisher during
every render intentionally starts new work. React, Preact, Vue, and Angular no
longer resubscribe only because `keyBy` has a new function identity, although a
stable selector is still preferable when its identity rule has not changed.

### A Publisher is used inside `textarea`, `title`, or `option`

These text-only hosts cannot safely contain a framework component boundary in
React, Preact, or Vue TSX. The compiler reports a direct error for a real
Publisher there. Materialize the current value with the framework hook or
composable and pass the resulting string or number to the host instead.

## Package entry points

| Entry point | Intended use |
| --- | --- |
| `reactor-bindings-ts` | Framework-neutral public types |
| `reactor-bindings-ts/solid` | Solid JSX types |
| `reactor-bindings-ts/react` | React components and hook |
| `reactor-bindings-ts/preact` | Preact components and hook |
| `reactor-bindings-ts/vue` | Vue component, composable, and JSX types |
| `reactor-bindings-ts/angular` | Angular standalone directive and pipes |
| `reactor-bindings-ts/{solid,react,preact,vue}/vite` | Combined Vite integration for that framework |
| `reactor-bindings-ts/compiler` | Advanced direct Babel integration |
| `reactor-bindings-ts/solid/compiler` | Solid-configured Babel integration |
| `reactor-bindings-ts/*/runtime` | Generated compiler target; normally not imported manually |
| `reactor-bindings-ts/*/jsx-runtime` | TypeScript JSX runtime target |
| `reactor-bindings-ts/*/jsx-dev-runtime` | Development JSX runtime target |

Most JSX applications should use the appropriate `/vite` module instead of
configuring Babel manually.

## Development

Install the pinned development dependencies and run the complete validation
suite:

```sh
npm ci
npm test
```

## Publishing

`npm pack` and `npm publish` automatically run a clean production build through
the package's `prepack` script. To inspect the package contents locally without
publishing them, run:

```sh
npm pack --dry-run
```

## License

This project is licensed under the
[GNU Lesser General Public License v3.0 only](./LICENSE.md). The short
[license notice](./LICENSE) identifies the package's SPDX license expression.
