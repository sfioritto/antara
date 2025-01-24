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

class ExtendableBase {
  private context = { value: 0 };

  step() {
    this.context.value += 1;
    console.log(this.context.value);
    return this;
  }
}

function createExtendable<T extends object[]>(...extensions: T) {
  // 1. Make an instance of the base class
  const instance = new ExtendableBase();

  // 2. Merge in all extension props
  Object.assign(instance, ...extensions);

  // 3. Build a type that includes the base class *and* the extension objects
  //    then pass it through `Chainable<>` so that all methods in *both* are chainified
  type FinalType = Chainable<ExtendableBase & UnionToIntersection<T[number]>>;

  // 4. Return that instance as FinalType
  return instance as FinalType;
}

const extensions = [
  {
    method1() {
      return (this as unknown as ExtendableBase).step();
    },
    nested: {
      nestedMethod() {
        return (this as unknown as ExtendableBase).step();
      }
    }
  },
  {
    method2() {
      return (this as unknown as ExtendableBase).step();
    }
  }
] as const;

const extended = createExtendable(...extensions);
// Now we can chain everything
extended.method1().method2().step().method1().method2()
