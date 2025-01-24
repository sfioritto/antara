import { JsonObject } from "./types";

type ExtensionBlock = {
  [key: string]: (...args: any[]) => Builder<ExtensionBlock> | object | ExtensionBlock
};

type Builder<TExtensionBlock extends ExtensionBlock> = {
  extend: (extension: Extension) => Builder<TExtensionBlock & ExtensionBlock>,
  step: () => Builder<TExtensionBlock>,
} & TExtensionBlock;

type Extension = (builder: Builder<ExtensionBlock>) => ExtensionBlock;

type UnionToIntersection<U> =
  (U extends any ? (k: U) => void : never) extends (k: infer I) => void ? I : never;

type CombinedBlockFromArray<T extends Extension[]> = UnionToIntersection<
  T extends (infer U)[]
    ? U extends Extension
      ? ReturnType<U>
      : never
    : never
>;

const createExtension = <T extends Extension>(fn: T): T => fn;

function createBuilder<TExtensionBlock extends ExtensionBlock>(...extensions: Extension[]): Builder<TExtensionBlock> {
  const builder = {
    extend(extension: Extension) {
      const newExtensions = [extension, ...extensions]
      type ExtendedBlock = CombinedBlockFromArray<typeof newExtensions>
      return createBuilder<ExtendedBlock>(...newExtensions);
    },
    step() {
      console.log('base step')
      return createBuilder<TExtensionBlock>(...extensions);
    }
  }

  let extendedBuilder = builder as Builder<TExtensionBlock>;
  for (const extension of extensions) {
    extendedBuilder = {
      ...extendedBuilder,
      ...extension(extendedBuilder),
    }
  }
  return extendedBuilder;
}

const firstExtension = createExtension((builder) => ({
  first: () => {
    console.log('first');
    return builder.step();
  }
}));

const secondExtension = createExtension((builder) => ({
  second: () => {
    console.log('second');
    return builder.step();
  }
}));


type FirstBlock = ReturnType<typeof firstExtension>;
type SecondBlock = ReturnType<typeof secondExtension>;
const extensions = [firstExtension, secondExtension];
type CombinedBlock = CombinedBlockFromArray<typeof extensions>
const testBuilder = createBuilder().extend(firstExtension);

type TestBuilder = typeof testBuilder;

const builder = createBuilder();
type BuilderExtended = typeof builder;
builder.extend(firstExtension).extend(secondExtension).first().first().second().step().second()