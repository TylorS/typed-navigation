import { Schema } from 'effect'

export const NavigationType = Schema.Literal('push', 'replace', 'reload', 'traverse')

export type NavigationType = typeof NavigationType.Type
