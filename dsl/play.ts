// Use recursive type alias with proper fixed point
type Builder<TExtensionRecord, TSelf> = {
  step: () => TSelf
} & TExtensionRecord

// Helper type to define what extension methods look like
type ExtensionMethod<TSelf> = () => TSelf

// Extension factory type - takes a builder and returns an extension record
type Extension<TSelf> = (builder: TSelf) => {
  [key: string]: ExtensionMethod<TSelf>
}

function createBuilder<
  TExtensionRecord extends {
    [K in keyof TExtensionRecord]: ExtensionMethod<Builder<TExtensionRecord, Builder<TExtensionRecord, any>>>
  }>(
  extension: Extension<Builder<TExtensionRecord, Builder<TExtensionRecord, any>>>
): Builder<TExtensionRecord, Builder<TExtensionRecord, any>> {
  const builder = {
    step: () => createBuilder<TExtensionRecord>(extension),
  } as Builder<TExtensionRecord, Builder<TExtensionRecord, any>>

  const extensionMethod = extension(builder)
  return { ...builder, ...extensionMethod }
}

const createExtension = <
  TExtensionRecord,
  TSelf extends Builder<TExtensionRecord, TSelf>
>(fn: Extension<TSelf>): Extension<TSelf> => fn;

type ExtensionType = {
  first: () => Builder<ExtensionType, Builder<ExtensionType, any>>
};

const extension = createExtension(<TExtensionRecord, TSelf extends Builder<TExtensionRecord, TSelf>>(builder: TSelf) => ({
  first: () => builder.step()
})) as Extension<Builder<ExtensionType, any>>;

const base = createBuilder<ExtensionType>(extension);

// Now this should work with proper typing
const first = base.first().step().first()