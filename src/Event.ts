import { Schema } from 'effect'
import { Destination } from './Destination.js'
import { FormData } from './Forms.js'
import { NavigationType } from './NavigationType.js'
import { ProposedDestination } from './ProposedDestination.js'

export const TransitionEvent = Schema.Struct({
  type: NavigationType,
  from: Destination,
  delta: Schema.Number,
  to: Schema.Union(ProposedDestination, Destination),
  info: Schema.Unknown,
})

export type TransitionEventEncoded = Schema.Schema.Encoded<typeof TransitionEvent>

export interface TransitionEvent extends Schema.Schema.Type<typeof TransitionEvent> {}

export const NavigationEvent = Schema.Struct({
  type: NavigationType,
  destination: Destination,
  info: Schema.Unknown,
})

export type NavigationEventEncoded = Schema.Schema.Encoded<typeof NavigationEvent>

export interface NavigationEvent extends Schema.Schema.Type<typeof NavigationEvent> {}
