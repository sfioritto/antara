// Define the base Builder type that includes both the step method and the extensions
type Builder<TExtensionRecord> = {
  step: () => Builder<TExtensionRecord>
} & TExtensionRecord

// Helper type to define what extension methods look like
type ExtensionMethod<TExtensionRecord> = (builder: Builder<TExtensionRecord>) => Builder<TExtensionRecord>

// Extension factory type - takes a builder and returns an extension record
type Extension<TExtensionRecord> = (builder: Builder<TExtensionRecord>) => TExtensionRecord


function createBuilder<
  TExtensionRecord extends {
    [K in keyof TExtensionRecord]: ExtensionMethod<TExtensionRecord>
  }>(
  extension: Extension<TExtensionRecord>
): Builder<TExtensionRecord> {
  const builder: Builder<TExtensionRecord> = {
    step: () => createBuilder<TExtensionRecord>(extension),
  } as Builder<TExtensionRecord>

  // Initialize extensions by calling the factory with the builder
  const extensionMethod = extension(builder)

  return { ...builder, ...extensionMethod }
}

const createExtension = <TExtensionRecord, T extends Extension<TExtensionRecord>>(fn: T): T => fn;


const extension = createExtension(<TExtensionRecord>(builder: Builder<TExtensionRecord>) => ({
  first: () => builder.step()
}));

type ExtensionRecord = ReturnType<typeof extension>
// Create the base builder with the ExtensionType
const base = createBuilder<ExtensionRecord>(extension);

// Now these should all work with proper typing
base.step().first().step().first()