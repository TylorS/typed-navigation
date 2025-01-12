import * as Schema from 'effect/Schema'

export const NavigateOptions = Schema.Struct({
  history: Schema.optional(Schema.Union(Schema.Literal('replace', 'push', 'auto'))),
  state: Schema.optional(Schema.Unknown),
  info: Schema.optional(Schema.Unknown),
})

export type NavigateOptions = Schema.Schema.Type<typeof NavigateOptions>
