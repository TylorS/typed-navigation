/**
 * @since 1.0.0
 */

import type { GetRandomValues } from '@typed/id'
import type * as Effect from 'effect/Effect'
import type * as Layer from 'effect/Layer'
import type { Destination } from './Destination.js'
import type { NavigationError } from './Error.js'
import type { TransitionEvent } from './Event.js'
import * as internalFromWindow from './internal/fromWindow.js'
import * as internalMemory from './internal/memory.js'
import type { Navigation } from './Navigation.js'

/**
 * @since 1.0.0
 */
export const fromWindow: (window: Window) => Layer.Layer<Navigation, never, GetRandomValues> =
  internalFromWindow.fromWindow

/**
 * @since 1.0.0
 */
export interface MemoryOptions {
  readonly entries: ReadonlyArray<Destination>
  readonly origin?: string | undefined
  readonly base?: string | undefined
  readonly currentIndex?: number | undefined
  readonly maxEntries?: number | undefined
  readonly commit?: Commit
}

/**
 * @since 1.0.0
 */
export const memory: (options: MemoryOptions) => Layer.Layer<Navigation, never, GetRandomValues> =
  internalMemory.memory

/**
 * @since 1.0.0
 */
export interface InitialMemoryOptions {
  readonly url: string | URL
  readonly origin?: string | undefined
  readonly base?: string | undefined
  readonly maxEntries?: number | undefined
  readonly state?: unknown
  readonly commit?: Commit
}

/**
 * @since 1.0.0
 */
export const initialMemory: (
  options: InitialMemoryOptions,
) => Layer.Layer<Navigation, never, GetRandomValues> = internalMemory.initialMemory

/**
 * @since 1.0.0
 */
export type Commit = (
  to: Destination,
  event: TransitionEvent,
) => Effect.Effect<void, NavigationError>
