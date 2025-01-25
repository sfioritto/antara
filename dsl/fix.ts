import { JsonObject } from "./types";

type Context = JsonObject;

type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

// Rewrites *every* function property so it returns the *entire* final object
type Chainable<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? (this: Chainable<T>, ...args: A) => Chainable<T>
    : T[K];
};

// Recursive type for extension objects created via extension functions
type RecursiveExtensionObject<TBuilder extends Builder<any>> = {
  [name: string]: (() => Chainable<TBuilder>) | RecursiveExtensionObject<TBuilder>;
};

// Non-recursive type for direct extension objects
type NonRecursiveExtensionObject<TBuilder extends Builder<any>> = {
  [name: string]: (this: Chainable<TBuilder>) => Chainable<TBuilder>;
};

// Update the Extension type to handle recursive structures
type Extension<TBuilder extends Builder<any>> =
  | NonRecursiveExtensionObject<TBuilder>
  | ((builder: TBuilder) => RecursiveExtensionObject<TBuilder>);

type ExtensionFunction<TBuilder extends Builder<any>> = (builder: TBuilder) =>
  | RecursiveExtensionObject<TBuilder>

type InferExtension<T> = T extends ExtensionFunction<any>
  ? ReturnType<T>
  : T;

class Builder<TExtensions extends Extension<Builder>[] = []> {
  constructor(
    private context: Context,
    private extensions: TExtensions,
  ) {}

  step() {
    const { extensions, context } = this;
    return createWorkflow({ extensions, context });
  }
}

function createWorkflow<
  TExtensions extends Extension<any>[]
>({ extensions, context = {} }: { extensions: TExtensions, context?: Context }) {
  const builder = new Builder<TExtensions>(context, extensions);

  const objectExtensions = extensions.map((extension: Extension<Builder<TExtensions>>) => {
    if (typeof extension === 'function') {
      return extension(builder);
    }

    return extension;
  })

  Object.assign(builder, ...objectExtensions);

  type ExtendedBuilder = Chainable<Builder & UnionToIntersection<InferExtension<TExtensions[number]>>>;

  return builder as ExtendedBuilder;
}

const createExtension = <
  TExtension extends Extension<Builder<any>>
>(
  extension: TExtension
): TExtension => extension;

const workflow = <
  TExtensions extends Extension<Builder<any>>[]
>(params: { extensions: TExtensions, context?: Context }) => {
  return createWorkflow(params);
};

const test = createExtension((builder) => ({
  test() {
    return builder.step();
  },
}));

type TEST = typeof test;
// Example of a non-recursive extension object
const test2 = createExtension({
  method1() {
    return this.step();
  },
});

type TEST2 = typeof test2;
// Example of a recursive extension function
const test3 = createExtension((builder) => ({
  nested: {
    test() {
      return builder.step();
    },
  }
}));

type TEST3 = typeof test3;

const customExtensions = [
  test3,
  createExtension({
    method1() {
      return this.step();
    },
  }),
];

type CUSTOM = UnionToIntersection<typeof customExtensions[number]>

const extended = workflow({ extensions: customExtensions });
// Now we can chain everything
const final = extended.method1().step().nested.test()
