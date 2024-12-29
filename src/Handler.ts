import type { Effect, Option } from 'effect'
import type { CancelNavigation, RedirectError } from './Error.js'
import type { TransitionEvent, NavigationEvent } from './Event.js'

export type BeforeNavigationHandler<R, R2> = (event: TransitionEvent) => Effect.Effect<
  // biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
  void | Option.Option<Effect.Effect<unknown, RedirectError | CancelNavigation, R2>>,
  RedirectError | CancelNavigation,
  R
>

export type NavigationHandler<R, R2> = (
  event: NavigationEvent,
  // biome-ignore lint/suspicious/noConfusingVoidType: <explanation>
) => Effect.Effect<void | Option.Option<Effect.Effect<unknown, never, R2>>, never, R>
