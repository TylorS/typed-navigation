import type { HttpBody } from '@effect/platform'
import type { Options } from '@effect/platform/HttpClientRequest'
import * as Array from 'effect/Array'
import * as Effect from 'effect/Effect'
import * as ParseResult from 'effect/ParseResult'
import * as Schema from 'effect/Schema'
import * as SchemaAST from 'effect/SchemaAST'
import type * as Types from 'effect/Types'
import type { NavigateOptions } from './NavigateOptions.js'
import { UrlSearchParamsFromSelf } from './Url.js'

export const BlobFromSelf = Schema.instanceOf(globalThis.Blob)
export type BlobFromSelf = typeof BlobFromSelf.Type

export const BlobFrom = Schema.TaggedStruct('Blob', {
  type: Schema.String,
  size: Schema.Number,
  data: Schema.Uint8Array,
})

export type BlobEncoded = typeof BlobFrom.Encoded
export type BlobFrom = typeof BlobFrom.Type

export const Blob: Schema.Schema<Blob, BlobEncoded> = BlobFrom.pipe(
  Schema.transformOrFail(BlobFromSelf, {
    strict: true,
    decode: (blob) => Effect.succeed(new globalThis.Blob([blob.data], { type: blob.type })),
    encode: (blob) =>
      Effect.promise(() =>
        blob
          .arrayBuffer()
          .then((data) =>
            BlobFrom.make({ type: blob.type, size: blob.size, data: new Uint8Array(data) }),
          ),
      ),
  }),
)

export const FileFromSelf = Schema.instanceOf(globalThis.File)
export type FileFromSelf = typeof FileFromSelf.Type

export const FileFrom = Schema.TaggedStruct('File', {
  name: Schema.String,
  size: Schema.Number,
  type: Schema.String,
  lastModified: Schema.DateFromNumber,
  data: Schema.Uint8Array,
})

export type FileEncoded = typeof FileFrom.Encoded
export type FileFrom = typeof FileFrom.Type

export const File: Schema.Schema<File, FileEncoded> = FileFrom.pipe(
  Schema.transformOrFail(FileFromSelf, {
    strict: true,
    decode: (file) =>
      Effect.succeed(
        new globalThis.File([file.data], file.name, {
          type: file.type,
          lastModified: file.lastModified.getTime(),
        }),
      ),
    encode: (file) =>
      Effect.promise(() =>
        file.arrayBuffer().then((data) =>
          FileFrom.make({
            name: file.name,
            size: file.size,
            type: file.type,
            lastModified: new Date(file.lastModified),
            data: new Uint8Array(data),
          }),
        ),
      ),
  }),
)

export const FormDataFromSelf = Schema.instanceOf(globalThis.FormData)
export type FormDataFromSelf = typeof FormDataFromSelf.Type

export const FormDataEntryValue = Schema.Union(Blob, File, Schema.String)
export type FormDataEntryValue = typeof FormDataEntryValue.Type
export type FormDataEntryValueEncoded = typeof FormDataEntryValue.Encoded

export const FormDataFrom = Schema.Record({
  key: Schema.String,
  value: FormDataEntryValue,
})

export type FormDataEncoded = typeof FormDataFrom.Encoded
export type FormDataFrom = typeof FormDataFrom.Type

export const FormData: Schema.Schema<FormData, FormDataEncoded> = FormDataFrom.pipe(
  Schema.transform(FormDataFromSelf, {
    strict: true,
    decode: structToFormData,
    encode: formDataToStruct,
  }),
)

type AnySchemaEncoded<T> = Schema.Schema<any, T, any> | Schema.Schema<any, T, never>

type AnyFormDataFieldSchema =
  | AnySchemaEncoded<string>
  | AnySchemaEncoded<Blob>
  | AnySchemaEncoded<File>
  | AnySchemaEncoded<string | null>
  | AnySchemaEncoded<Blob | null>
  | AnySchemaEncoded<File | null>

type FormDataFields = Record<string, AnyFormDataFieldSchema>

export function schemaFormData<const Fields extends FormDataFields>(
  fields: Fields,
): Schema.Schema<
  { readonly [K in keyof Schema.Struct.Type<Fields>]: Schema.Struct.Type<Fields>[K] },
  FormData,
  Schema.Schema.Context<Fields[keyof Fields]>
> {
  return Schema.transform(FormDataFromSelf, Schema.Struct(fields), {
    strict: false,
    decode: formDataToStruct,
    encode: structToFormData as any,
  })
}

function formDataToStruct(formData: FormData): Record<string, FormDataEntryValue> {
  const record: Record<string, FormDataEntryValue> = {}
  formData.forEach((value, key) => {
    record[key] = value
  })
  return record
}

function structToFormData(struct: Record<string, FormDataEntryValue>): FormData {
  const formData = new globalThis.FormData()
  for (const [key, value] of Object.entries(struct)) {
    formData.append(key, value)
  }
  return formData
}

export type FormGetSubmit = Types.Simplify<
  Options.NoBody &
    NavigateOptions & {
      readonly method: 'get'
      readonly name: string
      readonly action?: string | URL
    }
>

export type FormPostSubmit = Types.Simplify<
  Omit<FormGetSubmit, 'method'> & {
    readonly method: 'post'
    readonly body?: HttpBody.HttpBody
  }
>

export type FormSubmit = FormGetSubmit | FormPostSubmit

export const FormDataFromUrlSearchParams: Schema.Schema<FormData, URLSearchParams> =
  UrlSearchParamsFromSelf.pipe(
    Schema.transformOrFail(FormDataFromSelf, {
      strict: true,
      decode: (searchParams) => Effect.succeed(searchParamsToFormData(searchParams)),
      encode: (formData) =>
        Effect.gen(function* () {
          const searchParams = new globalThis.URLSearchParams()
          const errors: ParseResult.ParseIssue[] = []

          for (const [key, value] of Object.entries(formDataToStruct(formData))) {
            if (typeof value === 'string') {
              searchParams.set(key, value)
            } else {
              errors.push(
                new ParseResult.Type(
                  SchemaAST.stringKeyword,
                  value,
                  `Expected string at '${key}' but found ${value instanceof globalThis.File ? 'File' : 'Blob'}`,
                ),
              )
            }
          }

          if (Array.isNonEmptyReadonlyArray(errors)) {
            return yield* ParseResult.fail(
              new ParseResult.Composite(SchemaAST.stringKeyword, formData, errors),
            )
          }

          return searchParams
        }),
    }),
  )

export const UrlSearchParamsToFormData: Schema.Schema<URLSearchParams, FormData> = swap(
  FormDataFromUrlSearchParams,
)

function searchParamsToFormData(searchParams: URLSearchParams): FormData {
  const formData = new globalThis.FormData()
  searchParams.forEach((value, key) => {
    formData.append(key, value)
  })
  return formData
}

function swap<A, I, R>(schema: Schema.Schema<A, I, R>): Schema.Schema<I, A, R> {
  const encode = ParseResult.encode(schema)
  const decode = ParseResult.decode(schema)
  return Schema.transformOrFail(Schema.typeSchema(schema), Schema.encodedSchema(schema), {
    strict: true,
    decode: encode,
    encode: decode,
  })
}
