// Define the base Builder type that includes both the step method and the extensions
type Builder<TExtensionRecord> = {
  step: () => Builder<TExtensionRecord>
} & TExtensionRecord

// Helper type to define what extension methods look like
type ExtensionMethod<TExtensionRecord> = (builder: Builder<TExtensionRecord>) => Builder<TExtensionRecord>

// Extension factory type - takes a builder and returns an extension record
type ExtensionFactory<TExtensionRecord> = (builder: Builder<TExtensionRecord>) => TExtensionRecord

// Define the extension record type
type ExtensionType = {
  first: () => Builder<ExtensionType>
}

function createBuilder<TExtensionRecord extends { [K in keyof TExtensionRecord]: ExtensionMethod<TExtensionRecord> }>(
  extensionFactory: ExtensionFactory<TExtensionRecord>
): Builder<TExtensionRecord> {
  const builder: Builder<TExtensionRecord> = {
    step: () => createBuilder<TExtensionRecord>(extensionFactory),
  } as Builder<TExtensionRecord>

  // Initialize extensions by calling the factory with the builder
  const extensions = extensionFactory(builder)

  return { ...builder, ...extensions }
}

const extension = (builder: Builder<ExtensionType>) => ({
  first: () => builder.step()
})

// Create the base builder with the ExtensionType
const base = createBuilder<ExtensionType>(extension);

// Now these should all work with proper typing
base.step().first().step().first()