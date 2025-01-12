import * as Schema from 'effect/Schema'
import { Destination } from './Destination.js'

export const ProposedDestination = Destination.pipe(Schema.omit('id', 'key'))

export type ProposedDestinationEncoded = Schema.Schema.Encoded<typeof ProposedDestination>

export interface ProposedDestination extends Schema.Schema.Type<typeof ProposedDestination> {}
