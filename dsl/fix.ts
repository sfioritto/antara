import { JsonObject } from "./types"

type Builder<TExtensionRecord> = {
  step: () => Builder<TExtensionRecord>
}
type Extension<TExtensionRecord> = (builder: Builder<TExtensionRecord>) => object

function createBuilder(...extensions: any[]) {
  const builder = {
    step: () => {
      console.log('base step')
      return createBuilder(...extensions);
    },
  };

  return extensions.reduce(
    (acc, ext) => ({
      ...acc,
      ...ext(builder)
    }),
    builder
  );
}

const createExtension = <
  TExtensionRecord, T extends Extension<TExtensionRecord>
>(fn: T): T => fn;

const oneExtension = createExtension((builder) => ({
  one: () => {
    console.log('one');
    return builder.step();
  }
}));

const twoExtension = createExtension((builder) => ({
  two: () => {
    console.log('two')
    return builder.step();
  }
}));

// Usage
const builder = createBuilder(oneExtension, twoExtension);
builder.step().one().two().step().one().two()