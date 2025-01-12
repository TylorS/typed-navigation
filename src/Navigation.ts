import type { HttpClientResponse } from '@effect/platform'
import type { HttpClient } from '@effect/platform/HttpClient'
import * as LazyRef from '@typed/lazy-ref'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import type * as Option from 'effect/Option'
import type * as Scope from 'effect/Scope'
import type { Destination } from './Destination.js'
import { CancelNavigation, type FormSubmitError, NavigationError, RedirectError } from './Error.js'
import type { TransitionEvent } from './Event.js'
import type { FormSubmit } from './Forms.js'
import type { BeforeNavigationHandler, NavigationHandler } from './Handler.js'
import type { NavigateOptions } from './NavigateOptions.js'

export interface Navigation {
  readonly origin: string

  readonly base: string

  readonly currentEntry: LazyRef.Computed<Destination>

  readonly entries: LazyRef.Computed<ReadonlyArray<Destination>>

  readonly transition: LazyRef.Computed<Option.Option<TransitionEvent>>

  readonly canGoBack: LazyRef.Computed<boolean>

  readonly canGoForward: LazyRef.Computed<boolean>

  readonly navigate: (
    url: string | URL,
    options?: NavigateOptions,
  ) => Effect.Effect<Destination, NavigationError>

  readonly back: (options?: { readonly info?: unknown }) => Effect.Effect<
    Destination,
    NavigationError
  >

  readonly forward: (options?: { readonly info?: unknown }) => Effect.Effect<
    Destination,
    NavigationError
  >

  readonly traverseTo: (
    key: Destination['key'],
    options?: { readonly info?: unknown },
  ) => Effect.Effect<Destination, NavigationError>

  readonly updateCurrentEntry: (options: { readonly state: unknown }) => Effect.Effect<
    Destination,
    NavigationError
  >

  readonly reload: (options?: {
    readonly info?: unknown
    readonly state?: unknown
  }) => Effect.Effect<Destination, NavigationError>

  readonly beforeNavigation: <R = never, R2 = never>(
    handler: BeforeNavigationHandler<R, R2>,
  ) => Effect.Effect<void, never, R | R2 | Scope.Scope>

  readonly onNavigation: <R = never, R2 = never>(
    handler: NavigationHandler<R, R2>,
  ) => Effect.Effect<void, never, R | R2 | Scope.Scope>

  readonly submit: (
    form: FormSubmit,
  ) => Effect.Effect<
    readonly [Destination, HttpClientResponse.HttpClientResponse],
    NavigationError | FormSubmitError,
    Navigation | HttpClient | Scope.Scope
  >
}

export const Navigation = Context.GenericTag<Navigation>('@typed/Navigation')

export const CurrentEntry: LazyRef.Computed<Destination, never, Navigation> =
  LazyRef.computedFromTag(Navigation, (nav) => nav.currentEntry)

export const Entries: LazyRef.Computed<
  ReadonlyArray<Destination>,
  never,
  Navigation
> = LazyRef.computedFromTag(Navigation, (nav) => nav.entries)

export function getCurrentPathFromUrl(location: Pick<URL, 'pathname' | 'search' | 'hash'>): string {
  return location.pathname + location.search + location.hash
}

export const CurrentPath: LazyRef.Computed<string, never, Navigation> = LazyRef.computedFromTag(
  Navigation,
  (nav) => LazyRef.map(nav.currentEntry, (e) => getCurrentPathFromUrl(e.url)),
)

export const CanGoForward: LazyRef.Computed<boolean, never, Navigation> = LazyRef.computedFromTag(
  Navigation,
  (nav) => nav.canGoForward,
)

export const CanGoBack: LazyRef.Computed<boolean, never, Navigation> = LazyRef.computedFromTag(
  Navigation,
  (nav) => nav.canGoBack,
)

export const navigate = (
  url: string | URL,
  options?: NavigateOptions,
): Effect.Effect<Destination, NavigationError, Navigation> =>
  Effect.flatMap(Navigation, (nav) => nav.navigate(url, options))

export const back: (options?: { readonly info?: unknown }) => Effect.Effect<
  Destination,
  NavigationError,
  Navigation
> = (opts) => Effect.flatMap(Navigation, (nav) => nav.back(opts))

export const forward: (options?: { readonly info?: unknown }) => Effect.Effect<
  Destination,
  NavigationError,
  Navigation
> = (opts) => Effect.flatMap(Navigation, (nav) => nav.forward(opts))

export const traverseTo: (
  key: string,
  options?: { readonly info?: unknown },
) => Effect.Effect<Destination, NavigationError, Navigation> = (key, opts) =>
  Effect.flatMap(Navigation, (nav) => nav.traverseTo(key, opts))

export const updateCurrentEntry: (options: { readonly state: unknown }) => Effect.Effect<
  Destination,
  NavigationError,
  Navigation
> = (opts) => Effect.flatMap(Navigation, (nav) => nav.updateCurrentEntry(opts))

export const reload: (options?: {
  readonly info?: unknown
  readonly state?: unknown
}) => Effect.Effect<Destination, NavigationError, Navigation> = (opts) =>
  Effect.flatMap(Navigation, (nav) => nav.reload(opts))

export const Transition: LazyRef.Computed<
  Option.Option<TransitionEvent>,
  never,
  Navigation
> = LazyRef.computedFromTag(Navigation, (nav) => nav.transition)

export function handleRedirect(error: RedirectError) {
  return navigate(error.path, {
    history: 'replace',
    ...error.options,
  })
}

export function redirectToPath(
  path: string | URL,
  options?: { readonly state?: unknown; readonly info?: unknown },
): RedirectError {
  return new RedirectError({ path, options })
}

export function isNavigationError(e: unknown): e is NavigationError {
  return NavigationError.is(e)
}

export function isRedirectError(e: unknown): e is RedirectError {
  return RedirectError.is(e)
}

export function isCancelNavigation(e: unknown): e is CancelNavigation {
  return CancelNavigation.is(e)
}

export const cancelNavigation = Effect.suspend(() => new CancelNavigation())

export function beforeNavigation<R = never, R2 = never>(
  handler: BeforeNavigationHandler<R, R2>,
): Effect.Effect<void, never, Navigation | R | R2 | Scope.Scope> {
  return Effect.flatMap(Navigation, (nav) => nav.beforeNavigation(handler))
}

export function onNavigation<R = never, R2 = never>(
  handler: NavigationHandler<R, R2>,
): Effect.Effect<void, never, Navigation | R | R2 | Scope.Scope> {
  return Effect.flatMap(Navigation, (nav) => nav.onNavigation(handler))
}

export function submit(
  form: FormSubmit,
): Effect.Effect<
  readonly [Destination, HttpClientResponse.HttpClientResponse],
  NavigationError | FormSubmitError,
  Navigation | HttpClient | Scope.Scope
> {
  return Effect.flatMap(Navigation, (nav) => nav.submit(form))
}
