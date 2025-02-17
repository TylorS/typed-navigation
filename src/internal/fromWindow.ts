import { GetRandomValues, Uuid4 } from '@typed/id'
import * as LazyRef from '@typed/lazy-ref'
import { Schema } from 'effect'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import type * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Runtime from 'effect/Runtime'
import * as Scope from 'effect/Scope'
import type { Destination } from '../Destination.js'
import { NavigationError } from '../Error.js'
import type { NavigationEvent, TransitionEvent } from '../Event.js'
import type { Commit } from '../Layer.js'
import { Navigation } from '../Navigation.js'
import type { ModelAndIntent, PatchedState } from './shared.js'
import {
  getOriginalState,
  getUrl,
  isPatchedState,
  makeDestination,
  makeHandlersState,
  NavigationState,
  setupFromModelAndIntent,
} from './shared.js'

export const fromWindow: (window: Window) => Layer.Layer<Navigation, never, GetRandomValues> = (
  window: Window,
) =>
  Layer.scoped(
    Navigation,
    Effect.gen(function* () {
      const getRandomValues = yield* GetRandomValues
      const { run, runPromise } = yield* scopedRuntime<never>()
      const hasNativeNavigation = !!window.navigation
      const base = getBaseHref(window)
      const modelAndIntent = yield* hasNativeNavigation
        ? setupWithNavigation(window.navigation, runPromise)
        : setupWithHistory(window, base, (event) => run(handleHistoryEvent(event)))

      const navigation = setupFromModelAndIntent(
        modelAndIntent,
        window.location.origin,
        base,
        getRandomValues,
        hasNativeNavigation ? () => getNavigationState(window.navigation) : undefined,
      )

      return navigation

      function handleHistoryEvent(event: HistoryEvent) {
        return Effect.gen(function* () {
          if (event._tag === 'PushState') {
            return yield* navigation.navigate(event.url, {}, event.skipCommit)
          } else if (event._tag === 'ReplaceState') {
            if (Option.isSome(event.url)) {
              return yield* navigation.navigate(
                event.url.value,
                { history: 'replace', state: event.state },
                event.skipCommit,
              )
            } else {
              return yield* navigation.updateCurrentEntry(event)
            }
          } else if (event._tag === 'Traverse') {
            const { entries, index } = yield* modelAndIntent.state
            const toIndex = Math.min(Math.max(0, index + event.delta), entries.length - 1)
            const to = entries[toIndex]

            const result = yield* navigation.traverseTo(to.key, {}, event.skipCommit)

            return result
          } else {
            yield* navigation.traverseTo(event.key, {}, event.skipCommit)
            return yield* navigation.updateCurrentEntry({
              state: event.state,
            })
          }
        })
      }
    }),
  )

function getBaseHref(window: Window) {
  const base = window.document.querySelector('base')
  return base ? base.href : '/'
}

const getNavigationState = (navigation: globalThis.Navigation): NavigationState => {
  const entries = navigation.entries().map(nativeEntryToDestination)
  // biome-ignore lint/style/noNonNullAssertion: <explanation>
  const { index } = navigation.currentEntry!

  return {
    entries,
    index,
    transition: Option.none<TransitionEvent>(),
  }
}

function setupWithNavigation(
  navigation: globalThis.Navigation,
  runPromise: <E, A>(effect: Effect.Effect<A, E, Scope.Scope>) => Promise<A>,
): Effect.Effect<ModelAndIntent, never, Scope.Scope | GetRandomValues> {
  return Effect.gen(function* () {
    const state = yield* LazyRef.fromEffect(
      Effect.sync((): NavigationState => getNavigationState(navigation)),
      {
        eq: Schema.equivalence(Schema.typeSchema(NavigationState)),
      },
    )
    const { beforeHandlers, handlers } = yield* makeHandlersState
    const commit: Commit = (to: Destination, event: TransitionEvent) =>
      Effect.gen(function* () {
        const { key, state, url } = to
        const { info, type } = event

        if (type === 'push' || type === 'replace') {
          yield* Effect.promise(
            () =>
              navigation.navigate(url.toString(), {
                history: type,
                state,
                info,
              }).committed,
          )
        } else if (event.type === 'reload') {
          yield* Effect.promise(() => navigation.reload({ state, info }).committed)
        } else {
          yield* Effect.promise(() => navigation.traverseTo(key, { info }).committed)
        }
      }).pipe(Effect.catchAllDefect((cause) => new NavigationError({ cause })))

    const runHandlers = (native: globalThis.NavigationEventMap['navigate']) =>
      Effect.gen(function* () {
        const eventHandlers = yield* handlers
        const matches: Array<Effect.Effect<unknown>> = []
        const event: NavigationEvent = {
          type: native.navigationType,
          // biome-ignore lint/style/noNonNullAssertion: <explanation>
          destination: nativeEntryToDestination(navigation.currentEntry!),
          info: native.info,
        }

        for (const [handler, ctx] of eventHandlers) {
          const match = yield* Effect.provide(handler(event), ctx)
          if (match !== undefined && Option.isSome(match)) {
            matches.push(Effect.provide(match.value, ctx))
          }
        }

        if (matches.length > 0) {
          yield* Effect.all(matches)
        }
      })

    navigation.addEventListener('navigate', (ev) => {
      if (shouldNotIntercept(ev)) return

      ev.intercept({
        handler: () => runPromise(runHandlers(ev)),
      })
    })

    return {
      state,
      beforeHandlers,
      handlers,
      commit,
    } as const
  })
}

function nativeEntryToDestination(
  entry: Pick<
    globalThis.NavigationHistoryEntry,
    'id' | 'key' | 'url' | 'getState' | 'sameDocument'
  >,
): Destination {
  return {
    id: Uuid4.make(entry.id),
    key: Uuid4.make(entry.key),
    // biome-ignore lint/style/noNonNullAssertion: <explanation>
    url: new URL(entry.url!),
    state: entry.getState(),
    sameDocument: entry.sameDocument,
  }
}

function shouldNotIntercept(navigationEvent: globalThis.NavigationEventMap['navigate']): boolean {
  return (
    !navigationEvent.canIntercept ||
    // If this is just a hashChange,
    // just let the browser handle scrolling to the content.
    navigationEvent.hashChange ||
    // If this is a download,
    // let the browser perform the download.
    !!navigationEvent.downloadRequest ||
    // If this is a form submission,
    // let that go to the server.
    !!navigationEvent.formData
  )
}

function setupWithHistory(
  window: Window,
  base: string,
  onEvent: (event: HistoryEvent) => void,
): Effect.Effect<ModelAndIntent, never, GetRandomValues | Scope.Scope> {
  return Effect.gen(function* () {
    const { location } = window
    const { getHistoryState, original: history, unpatch } = patchHistory(window, onEvent, base)

    yield* Effect.addFinalizer(() => unpatch)

    const state = yield* LazyRef.fromEffect(
      Effect.suspend(() =>
        Effect.map(
          makeDestination(new URL(location.href), getHistoryState(), location.origin),
          (destination): NavigationState => ({
            entries: [destination],
            index: 0,
            transition: Option.none(),
          }),
        ),
      ),
      { eq: Schema.equivalence(Schema.typeSchema(NavigationState)) },
    )
    const { beforeHandlers, handlers } = yield* makeHandlersState
    const commit: Commit = ({ id, key, state, url }: Destination, event: TransitionEvent) =>
      Effect.sync(() => {
        const { type } = event

        if (type === 'push') {
          history.pushState(
            {
              __typed__navigation__id__: id,
              __typed__navigation__key__: key,
              __typed__navigation__state__: state,
            },
            '',
            url,
          )
        } else if (type === 'replace') {
          history.replaceState(
            {
              __typed__navigation__id__: id,
              __typed__navigation__key__: key,
              __typed__navigation__state__: state,
            },
            '',
            url,
          )
        } else if (event.type === 'reload') {
          location.reload()
        } else {
          history.go(event.delta)

          history.replaceState(
            {
              __typed__navigation__id__: id,
              __typed__navigation__key__: key,
              __typed__navigation__state__: state,
            },
            '',
            window.location.href,
          )
        }
      })

    return {
      state,
      beforeHandlers,
      handlers,
      commit,
    } satisfies ModelAndIntent
  })
}

type HistoryEvent = PushStateEvent | ReplaceStateEvent | TraverseEvent | TraverseToEvent

type PushStateEvent = {
  _tag: 'PushState'
  state: unknown
  url: URL
  skipCommit: boolean
}
type ReplaceStateEvent = {
  _tag: 'ReplaceState'
  state: unknown
  url: Option.Option<URL>
  skipCommit: boolean
}
type TraverseEvent = { _tag: 'Traverse'; delta: number; skipCommit: boolean }
type TraverseToEvent = {
  _tag: 'TraverseTo'
  key: Uuid4
  state: unknown
  skipCommit: boolean
}

function patchHistory(window: Window, onEvent: (event: HistoryEvent) => void, base: string) {
  const { history, location } = window
  const stateDescriptor =
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(history), 'state') ||
    Object.getOwnPropertyDescriptor(history, 'state')

  const methods = {
    pushState: history.pushState.bind(history),
    replaceState: history.replaceState.bind(history),
    go: history.go.bind(history),
    back: history.back.bind(history),
    forward: history.forward.bind(history),
  }
  const getStateDescriptor = stateDescriptor?.get?.bind(history)

  const getHistoryState = () => getStateDescriptor?.()

  const original: History = {
    get length() {
      return history.length
    },
    get scrollRestoration() {
      return history.scrollRestoration
    },
    set scrollRestoration(mode) {
      history.scrollRestoration = mode
    },
    get state() {
      return getHistoryState()
    },
    ...methods,
    pushState(data, _, url) {
      return methods.pushState(data, _, url?.toString())
    },
    replaceState(data, _, url) {
      return methods.replaceState(data, _, url?.toString())
    },
  }

  history.pushState = (state, _, url) => {
    if (url) {
      onEvent({
        _tag: 'PushState',
        state,
        url: getUrl(location.origin, url, base),
        skipCommit: false,
      })
    } else {
      onEvent({
        _tag: 'ReplaceState',
        state,
        url: Option.none(),
        skipCommit: false,
      })
    }
  }
  history.replaceState = (state, _, url) => {
    onEvent({
      _tag: 'ReplaceState',
      state,
      url: url ? Option.some(getUrl(location.origin, url, base)) : Option.none(),
      skipCommit: false,
    })
  }
  history.go = (delta) => {
    if (delta && delta !== 0) {
      onEvent({ _tag: 'Traverse', delta, skipCommit: false })
    }
  }
  history.back = () => {
    onEvent({ _tag: 'Traverse', delta: -1, skipCommit: false })
  }
  history.forward = () => {
    onEvent({ _tag: 'Traverse', delta: 1, skipCommit: false })
  }

  const onHashChange = (ev: HashChangeEvent) => {
    onEvent({
      _tag: 'ReplaceState',
      state: history.state,
      url: Option.some(new URL(ev.newURL)),
      skipCommit: false,
    })
  }

  window.addEventListener('hashchange', onHashChange, { capture: true })

  const onPopState = (ev: PopStateEvent) => {
    if (isPatchedState(ev.state)) {
      onEvent({
        _tag: 'TraverseTo',
        key: ev.state.__typed__navigation__key__,
        state: ev.state.__typed__navigation__state__,
        skipCommit: true,
      })
    } else {
      onEvent({
        _tag: 'ReplaceState',
        state: ev.state,
        url: Option.some(new URL(location.href)),
        skipCommit: true,
      })
    }
  }

  window.addEventListener('popstate', onPopState, { capture: true })

  const unpatch = Effect.sync(() => {
    history.pushState = original.pushState
    history.replaceState = original.replaceState
    history.go = original.go
    history.back = original.back
    history.forward = original.forward

    if (stateDescriptor) {
      try {
        Object.defineProperty(history, 'state', stateDescriptor)
      } catch {
        // We tried, but it didn't work
      }
    }

    window.removeEventListener('hashchange', onHashChange)
    window.removeEventListener('popstate', onPopState)
  })

  Object.defineProperty(history, 'state', {
    get() {
      return getOriginalState(getStateDescriptor?.() ?? history.state)
    },
    set(value) {
      const { __typed__navigation__id__, __typed__navigation__key__ } =
        getStateDescriptor?.() ?? original.state

      if (isPatchedState(value)) {
        // The setter is not actually modifying the history.state
        // We need to call the original replaceState to update the actual state
        original.replaceState.call(history, value, '', location.href)
      } else {
        // The setter is not actually modifying the history.state
        // We need to call the original replaceState to update the actual state
        original.replaceState.call(
          history,
          {
            __typed__navigation__id__,
            __typed__navigation__key__,
            __typed__navigation__state__: value,
          } satisfies PatchedState,
          '',
          location.href,
        )
      }

      return value
    },
  })

  return {
    getHistoryState,
    original,
    patched: history,
    unpatch,
  } as const
}

type ScopedRuntime<R> = {
  readonly runtime: Runtime.Runtime<R | Scope.Scope>
  readonly scope: Scope.Scope
  readonly run: <E, A>(effect: Effect.Effect<A, E, R | Scope.Scope>) => Fiber.RuntimeFiber<A, E>
  readonly runPromise: <E, A>(effect: Effect.Effect<A, E, R | Scope.Scope>) => Promise<A>
}

function scopedRuntime<R>(): Effect.Effect<ScopedRuntime<R>, never, R | Scope.Scope> {
  return Effect.map(Effect.runtime<R | Scope.Scope>(), (runtime) => {
    const scope = Context.get(runtime.context, Scope.Scope)
    const runFork = Runtime.runFork(runtime)
    const runPromise = <E, A>(effect: Effect.Effect<A, E, R | Scope.Scope>): Promise<A> =>
      new Promise((resolve, reject) => {
        const fiber = runFork(effect, { scope })
        fiber.addObserver(
          Exit.match({
            onFailure: (cause) => reject(Runtime.makeFiberFailure(cause)),
            onSuccess: resolve,
          }),
        )
      })

    return {
      runtime,
      scope: Context.unsafeGet(runtime.context, Scope.Scope),
      run: (eff) => runFork(eff, { scope }),
      runPromise,
    } as const
  })
}
