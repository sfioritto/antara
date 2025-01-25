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

// Update the Extension type to only handle non-recursive structures
type Extension<TBuilder extends Builder<any>> = {
  [name: string]: (this: Chainable<TBuilder>) => Chainable<TBuilder>;
};

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

  // Simplify extension handling since we no longer need to handle functions
  Object.assign(builder, ...extensions);

  type ExtendedBuilder = Chainable<Builder & UnionToIntersection<TExtensions[number]>>;

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

// Update test examples to use only object extensions
const test = createExtension({
  test() {
    return this.step();
  },
});

type TEST = typeof test;

const test2 = createExtension({
  method1() {
    return this.step();
  },
});

type TEST2 = typeof test2;

// Update test3 to be non-recursive
const test3 = createExtension({
  nestedTest() {
    return this.step();
  },
});

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
const final = extended.method1().step().nestedTest()
