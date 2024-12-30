import { Schema } from 'effect'
import { Url } from './Url.js'

export class NavigationError extends Schema.TaggedError<NavigationError>()('NavigationError', {
  cause: Schema.Unknown,
}) {
  static is = Schema.is(NavigationError)
}

export class RedirectError extends Schema.TaggedError<RedirectError>()('RedirectError', {
  path: Schema.Union(Schema.String, Url),
  options: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
}) {
  static is = Schema.is(RedirectError)
}

export class CancelNavigation extends Schema.TaggedError<CancelNavigation>()(
  'CancelNavigation',
  {},
) {
  static is = Schema.is(CancelNavigation)
}

export class FormSubmitError extends Schema.TaggedError<FormSubmitError>()('FormSubmitError', {
  cause: Schema.Unknown,
}) {
  static is = Schema.is(FormSubmitError)
}
