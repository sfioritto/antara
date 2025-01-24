import { JsonObject } from "./types"

type Builder<TExtensionRecord> = {
  step: () => Builder<TExtensionRecord>
};

type Extension<TExtensionRecord> = (builder: Builder<TExtensionRecord>) => any;

type StepFunction<TExtensionRecord> = () => Builder<TExtensionRecord>;

type ExtensionRecord<TExtensionRecord extends ExtensionRecord<any>> = {
  [name: string]: StepFunction<TExtensionRecord> | object | ExtensionRecord<TExtensionRecord>
}

function createBuilder(...extensions: Extension<any>[]) {
  type ExtensionRecord = ReturnType<typeof extensions[number]>
  const builder = {
    step: () => {
      console.log('base step')
      return createBuilder(...extensions);
    },
  };

  return extensions.reduce(
    (acc, ext) => ({
      ...acc,
      ...(ext as Extension<ExtensionRecord>)(builder)
    }),
    builder
  ) as Builder<ExtensionRecord>;
}

const createExtension = <
  TExtensionRecord extends ExtensionRecord<any>, T extends (builder: Builder<TExtensionRecord>) => ExtensionRecord<TExtensionRecord>
>(fn: T): Extension<TExtensionRecord> => {
  return (builder: Builder<TExtensionRecord>): ExtensionRecord<any> => fn(builder);
};

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

const extensions = [oneExtension, twoExtension]
type TExtensionRecord = ReturnType<typeof extensions[number]>
const builder = createBuilder(oneExtension, twoExtension);