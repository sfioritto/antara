import { JsonObject } from "./types";

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
  private context = { value: 0 };

  step() {
    this.context.value += 1;
    console.log(this.context.value);
    return this;
  }
}

function createWorkflow<T extends object[]>(...extensions: T) {
  // 1. Make an instance of the base class
  const builder = new Builder();

  // 2. Merge in all extension props
  Object.assign(builder, ...extensions);

  // 3. Build a type that includes the base class *and* the extension objects
  //    then pass it through `Chainable<>` so that all methods in *both* are chainified
  type ExtendedBuilder = Chainable<Builder & UnionToIntersection<T[number]>>;

  // 4. Return that instance as FinalType
  return builder as ExtendedBuilder;
}

const createExtension = <T extends Extension>(extension: T): T => extension;

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
] as const;

const extended = createWorkflow(...extensions);
// Now we can chain everything
extended.method1().method1().method2()
