import * as Schema from 'effect/Schema'

export const NavigationType = Schema.Literal('push', 'replace', 'reload', 'traverse')

export type NavigationType = typeof NavigationType.Type
