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

type Extension = {
  [name: string]: (this: Chainable<Builder>) => Chainable<Builder>;
}

class Builder {
  constructor(context: Context) {

  }
  step() {
    return this;
  }
}

function createWorkflow<
  TExtensions extends Extension[]
>({ extensions, context = {} }: { extensions: TExtensions, context?: Context }) {
  // 1. Make an instance of the base class
  const builder = new Builder(context);

  // 2. Merge in all extension props
  Object.assign(builder, ...extensions);

  // 3. Build a type that includes the base class *and* the extension objects
  //    then pass it through `Chainable<>` so that all methods in *both* are chainified
  type ExtendedBuilder = Chainable<Builder & UnionToIntersection<TExtensions[number]>>;

  // 4. Return that instance as FinalType
  return builder as ExtendedBuilder;
}

const createExtension = <TExtension extends Extension>(extension: TExtension): TExtension => extension;

const workflow = <TExtensions extends Extension[]>(params: { extensions: TExtensions, context?: Context}) => {
  return createWorkflow(params);
};

const extensions = [
  createExtension({
    method1() {
      return this.step();
    },
  }),
  createExtension({
    method2() {
      return this.step();
    },
  })
];

const extended = workflow({ extensions });
// Now we can chain everything
extended.method1().method1().method2().step()
