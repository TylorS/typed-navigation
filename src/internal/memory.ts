import { GetRandomValues } from '@typed/id'
import * as LazyRef from '@typed/lazy-ref'
import { Schema } from 'effect'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import type * as Scope from 'effect/Scope'
import type { Commit, InitialMemoryOptions, MemoryOptions } from '../Layer.js'
import { Navigation } from '../Navigation.js'
import {
  getOriginFromUrl,
  getUrl,
  makeDestination,
  makeHandlersState,
  NavigationState,
  setupFromModelAndIntent,
  type ModelAndIntent,
} from './shared'

export const memory = (options: MemoryOptions): Layer.Layer<Navigation, never, GetRandomValues> =>
  Layer.scoped(
    Navigation,
    Effect.gen(function* () {
      const getRandomValues = yield* GetRandomValues
      const modelAndIntent = yield* setupMemory(options)
      const current = options.entries[options.currentIndex ?? 0]
      const origin = options.origin ?? getOriginFromUrl(current.url)
      const base = options.base ?? '/'

      return setupFromModelAndIntent(modelAndIntent, origin, base, getRandomValues)
    }),
  )

export function initialMemory(
  options: InitialMemoryOptions,
): Layer.Layer<Navigation, never, GetRandomValues> {
  return Layer.scoped(
    Navigation,
    Effect.gen(function* () {
      const getRandomValues = yield* GetRandomValues
      const origin = options.origin ?? getOriginFromUrl(options.url)
      const base = options.base ?? '/'
      const destination = yield* makeDestination(getUrl(origin, options.url), options.state, origin)
      const memoryOptions: MemoryOptions = {
        ...options,
        entries: [destination],
        origin,
        base,
        currentIndex: 0,
      }
      const modelAndIntent = yield* setupMemory(memoryOptions)

      return setupFromModelAndIntent(modelAndIntent, origin, base, getRandomValues)
    }),
  )
}

const eq = Schema.equivalence(Schema.typeSchema(NavigationState))

const clampNavigationState =
  (maxEntries: number) =>
  (state: NavigationState): NavigationState => {
    const entries = state.entries.slice(-maxEntries)
    const index = Math.min(Math.max(0, state.index), entries.length - 1)
    return {
      entries,
      index,
      transition: state.transition,
    }
  }

function setupMemory(
  options: MemoryOptions,
): Effect.Effect<ModelAndIntent, never, GetRandomValues | Scope.Scope> {
  return Effect.gen(function* () {
    const maxEntries = options.maxEntries ?? 50
    const state = LazyRef.transform(
      yield* LazyRef.of<NavigationState>(
        {
          entries: options.entries,
          index: options.currentIndex ?? options.entries.length - 1,
          transition: Option.none(),
        },
        { eq },
      ),
      clampNavigationState(maxEntries),
      clampNavigationState(maxEntries),
    )
    const { beforeHandlers, handlers } = yield* makeHandlersState
    const commit: Commit = options.commit ?? (() => Effect.void)

    return {
      state,
      beforeHandlers,
      handlers,
      commit,
    } as const
  })
}
