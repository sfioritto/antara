import { JsonObject } from "./types";


type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

type Chainable<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? (this: Chainable<T>, ...args: A) => Chainable<T>
    : T[K];
};

class Extendable<Extensions extends object> {
  private context: {value: number} = { value: 0 };
  constructor(extensions: Extensions) {
    Object.assign(this, extensions);
  }

  static create<T extends object>(extensions: T) {
    // Create an instance, but pretend it’s an intersection
    const instance = new Extendable<T>(extensions);
    return instance as Extendable<T> & T;
  }

  step() {
    this.context.value = this.context.value + 1
    console.log(this.context.value)
    return this;
  }
}

function mergeAll<T extends object[]>(...objs: T): Chainable<UnionToIntersection<T[number]>> {
  const merged = Object.assign({}, ...objs) as UnionToIntersection<T[number]>;
  // No actual rewriting at runtime, just a type assertion
  return merged as Chainable<UnionToIntersection<T[number]>>;
}

const extensions = [
  {
    method1() {
      return (this as unknown as Extendable<any>).step()
    }
  },
  {
    method2() {
      return (this as unknown as Extendable<any>).step()
    }
  }
] as const;

const reducedExtensions = mergeAll(...extensions);

const extended = Extendable.create(reducedExtensions);
extended.method2().method1()
