import * as LazyRef from '@typed/lazy-ref'
import { Stream } from 'effect'
import * as Data from 'effect/Data'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import type * as Scope from 'effect/Scope'
import type { Destination } from './Destination.js'
import { CancelNavigation, type RedirectError } from './Error.js'
import type { TransitionEvent } from './Event.js'
import type { NavigateOptions } from './NavigateOptions.js'
import { Navigation, redirectToPath } from './Navigation.js'

export interface BlockNavigation extends LazyRef.Computed<Option.Option<Blocking>> {
  readonly isBlocking: LazyRef.Computed<boolean>
  readonly whenBlocked: <A, E, R>(
    handler: (blocking: Blocking) => Effect.Effect<A, E, R>,
    options?: Parameters<typeof Stream.flatMap>[2],
  ) => Effect.Effect<void, E, R>
}

export interface Blocking extends TransitionEvent {
  readonly cancel: Effect.Effect<Destination>
  readonly confirm: Effect.Effect<Destination>
  readonly redirect: (
    urlOrPath: string | URL,
    options?: NavigateOptions,
  ) => Effect.Effect<Destination>
}

type InternalBlockState = Unblocked | Blocked

type Unblocked = {
  readonly _tag: 'Unblocked'
}
const Unblocked: Unblocked = Data.struct({ _tag: 'Unblocked' })

type Blocked = {
  readonly _tag: 'Blocked'
  readonly event: TransitionEvent
  readonly deferred: Deferred.Deferred<void, RedirectError | CancelNavigation>
}

const Blocked = (event: TransitionEvent) =>
  Effect.map(
    Deferred.make<void, RedirectError | CancelNavigation>(),
    (deferred): Blocked => Data.struct({ _tag: 'Blocked', deferred, event }),
  )

export interface UseBlockNavigationParams<R = never> {
  readonly shouldBlock?: (
    event: TransitionEvent,
  ) => Effect.Effect<boolean, RedirectError | CancelNavigation, R>
}

export const useBlockNavigation = <R = never>(
  params: UseBlockNavigationParams<R> = {},
): Effect.Effect<BlockNavigation, never, Navigation | R | Scope.Scope> =>
  Effect.gen(function* () {
    const navigation = yield* Navigation
    const blockState = yield* LazyRef.of<InternalBlockState>(Unblocked)

    yield* navigation.beforeNavigation<R, never>((event) =>
      LazyRef.modifyEffect(blockState, (state) =>
        Effect.gen(function* () {
          // Can't block twice
          if (state._tag === 'Blocked') return [Option.none(), state] as const

          if (params.shouldBlock && !(yield* params.shouldBlock(event))) {
            return [Option.none(), state] as const
          }

          const updated = yield* Blocked(event)

          return [Option.some(Deferred.await(updated.deferred)), updated] as const
        }),
      ),
    )

    const computed = LazyRef.map(blockState, (s) => {
      return s._tag === 'Blocked' ? Option.some(blockedToBlocking(navigation, s)) : Option.none()
    })

    const blockNavigation: BlockNavigation = Object.assign(computed, {
      isBlocking: LazyRef.map(blockState, (s) => s._tag === 'Blocked'),
      whenBlocked: <A, E, R>(
        handler: (blocking: Blocking) => Effect.Effect<A, E, R>,
        options?: Parameters<typeof Stream.flatMap>[2],
      ) =>
        Stream.filterMap(computed.changes, (blocking) => blocking).pipe(
          Stream.flatMap(handler, options),
          Stream.runDrain,
        ),
    })

    return blockNavigation
  })

function blockedToBlocking(navigation: Navigation, state: Blocked): Blocking {
  return {
    ...state.event,
    cancel: Effect.zipRight(
      Deferred.failSync(state.deferred, () => new CancelNavigation()),
      navigation.currentEntry,
    ),
    confirm: Effect.zipRight(Deferred.succeed(state.deferred, undefined), navigation.currentEntry),
    redirect: (url, options) =>
      Effect.zipRight(
        Deferred.fail(state.deferred, redirectToPath(url, options)),
        navigation.currentEntry,
      ),
  }
}
