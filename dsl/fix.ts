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

type ExtensionObject<TBuilder extends Builder<any>> = {
  [name: string]: (this: Chainable<TBuilder>) => Chainable<TBuilder>;
}

type ExtensionFunction<TBuilder extends Builder<any>> = (builder: TBuilder) => ExtensionObject<TBuilder>;

type Extension<TBuilder extends Builder<any>> = ExtensionObject<TBuilder> | ExtensionFunction<TBuilder>;

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

  type ExtendedBuilder = Chainable<Builder & UnionToIntersection<TExtensions[number]>>;

  return builder as ExtendedBuilder;
}

const createExtension = <TExtension extends Extension<Builder<any>>>(extension: TExtension): TExtension => extension;

const workflow = <TExtensions extends Extension<Builder<any>>[]>(params: { extensions: TExtensions, context?: Context}) => {
  return createWorkflow(params);
};

const test = createExtension((builder) => ({
  test() {
    return builder.step()
  },
}))
type Test = ReturnType<typeof test>;

const test2 = createExtension({
  method1() {
    return this.step();
  },
});
type Test2 = typeof test2;

const customExtensions = [
  createExtension({
    method1() {
      return this.step();
    },
  }),
  createExtension((builder) => ({
    method3() {
      return builder.step();
    }
  })),
  createExtension({
    method2() {
      return this.step();
    },
  })
];

const extended = workflow({ extensions: customExtensions });
// Now we can chain everything
extended.method1().method2().step().method1()
