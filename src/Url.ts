import { Effect, ParseResult, Schema } from 'effect'

export const UrlFromSelf = Schema.instanceOf(URL).annotations({
  equivalence: () => (a, b) => a.href === b.href,
  jsonSchema: {
    title: 'URL',
    identifier: 'URL',
    type: 'string',
    format: 'uri',
  },
})

export const Url = Schema.String.pipe(
  Schema.transformOrFail(UrlFromSelf, {
    decode: (s) =>
      Effect.try({
        try: () => new URL(s),
        catch: () => new ParseResult.Type(UrlFromSelf.ast, s, 'Expected a URL'),
      }),
    encode: (url) => Effect.succeed(url.href),
  }),
)
