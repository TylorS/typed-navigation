import * as Schema from 'effect/Schema'
import { Url } from './Url.js'

export const Destination = Schema.Struct({
  id: Schema.UUID,
  key: Schema.UUID,
  url: Url,
  state: Schema.Unknown,
  sameDocument: Schema.Boolean,
})

export type DestinationEncoded = Schema.Schema.Encoded<typeof Destination>

export interface Destination extends Schema.Schema.Type<typeof Destination> {}
