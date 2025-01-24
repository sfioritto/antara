// Use recursive type alias with proper fixed point
type Builder<TExtensionRecord, TBuilder> = {
  step: () => TBuilder
} & TExtensionRecord

// Helper type to define what extension methods look like
type ExtensionMethod<TBuilder> = () => TBuilder

// Extension factory type - takes a builder and returns an extension record
type Extension<TBuilder> = (builder: TBuilder) => {
  [key: string]: ExtensionMethod<TBuilder> | Record<string, any> | { [key: string]: ExtensionMethod<TBuilder> }
}

type ExtensionsRecord<TExtensionRecord> = {
  [K in keyof TExtensionRecord]: ExtensionMethod<Builder<TExtensionRecord, any>> | Record<string, any> | ExtensionsRecord<TExtensionRecord>
}

function createBuilder<
  TExtensionRecord extends ExtensionsRecord<any>>(
  extension: Extension<Builder<TExtensionRecord, any>>
): Builder<TExtensionRecord, any> {
  const builder = {
    step: () => createBuilder<TExtensionRecord>(extension),
  } as Builder<TExtensionRecord, Builder<TExtensionRecord, any>>

  const extensionMethod = extension(builder)
  return { ...builder, ...extensionMethod }
}

// const createExtension = <
//   TExtensionRecord,
//   TBuilder extends Builder<TExtensionRecord, TBuilder>
// >(fn: Extension<TBuilder>): Extension<TBuilder> => fn;

const createExtension = <T extends Extension<any>>(fn: T): T => fn;

type ExtensionType = {
  first: () => Builder<ExtensionType, Builder<ExtensionType, any>>,
  cool: { thing: 'thing' },
  nested: {
    second: () => Builder<ExtensionType, Builder<ExtensionType, any>>
  }
};

const extension = createExtension((builder) => ({
  first: () => builder.step(),
  nested: {
    second: () => builder.step()
  }
}));

type TExtensionType = ReturnType<typeof extension>;

const base = createBuilder<ExtensionType>(extension);
base.first().nested.second().first().step()

// Now this should work with proper typing