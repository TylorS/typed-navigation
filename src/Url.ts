import * as Effect from 'effect/Effect'
import * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'

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

export const UrlSearchParamsFromSelf = Schema.instanceOf(URLSearchParams).annotations({
  equivalence: () => (a, b) => a.toString() === b.toString(),
})

export const UrlSearchParamsFromString = Schema.String.pipe(
  Schema.transform(UrlSearchParamsFromSelf, {
    decode: (s) => new URLSearchParams(s),
    encode: (searchParams) => `?${searchParams.toString()}`,
  }),
)

export const UrlSearchParams = Schema.Record({
  key: Schema.String,
  value: Schema.Union(Schema.String, Schema.Array(Schema.String)),
}).pipe(
  Schema.transform(UrlSearchParamsFromSelf, {
    strict: true,
    decode: structToUrlSearchParams,
    encode: urlSearchParamsToStruct,
  }),
)

type AnySchemaEncoded<T> = Schema.Schema<any, T, any> | Schema.Schema<any, T, never>
type AnyFormDataFieldSchema =
  | AnySchemaEncoded<string>
  | AnySchemaEncoded<readonly string[]>
  | AnySchemaEncoded<string | readonly string[]>

type UrlSearchParamsFields = Record<string, AnyFormDataFieldSchema>

export function schemaUrlSearchParams<const Fields extends UrlSearchParamsFields>(
  fields: Fields,
): Schema.Schema<
  { readonly [K in keyof Schema.Struct.Type<Fields>]: Schema.Struct.Type<Fields>[K] },
  URLSearchParams,
  Schema.Schema.Context<Fields[keyof Fields]>
> {
  const struct = Schema.Struct(fields)
  const encode = ParseResult.encode(struct)
  const decode = ParseResult.decodeUnknown(struct)

  return Schema.transformOrFail(UrlSearchParamsFromSelf, Schema.typeSchema(struct), {
    strict: true,
    decode: (searchParams) => decode(urlSearchParamsToStruct(searchParams)),
    encode: (struct) =>
      Effect.map(encode(struct), (_) =>
        structToUrlSearchParams(_ as Readonly<Record<string, string | readonly string[]>>),
      ),
  })
}

function structToUrlSearchParams(
  struct: Readonly<Record<string, string | readonly string[]>>,
): URLSearchParams {
  const searchParams = new URLSearchParams()
  for (const [key, value] of Object.entries(struct)) {
    if (Array.isArray(value)) {
      for (const v of value) {
        searchParams.append(key, v)
      }
    } else {
      searchParams.set(key, value as string)
    }
  }
  return searchParams
}

function urlSearchParamsToStruct(
  searchParams: URLSearchParams,
): Readonly<Record<string, string | readonly string[]>> {
  const struct: Record<string, string | readonly string[]> = {}
  searchParams.forEach((_, key) => {
    const values = searchParams.getAll(key)
    if (values.length === 1) {
      struct[key] = values[0]
    } else {
      struct[key] = values
    }
  })
  return struct
}
