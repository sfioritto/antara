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

type ExtensionMethods<TBuilder extends Builder<any>> = {
  [name: string]: (this: Chainable<TBuilder>) => Chainable<TBuilder>;
};

type Extension<
  TExtensionMethods,
  TNamespace = string,
> = {
  namespace?: TNamespace;
  methods: TExtensionMethods;
};

const PrivateMethods = Symbol('PrivateMethods');
class Builder<TExtensions extends Extension<ExtensionMethods<Builder>>[] = []> {
  private [PrivateMethods]: Record<string, Function>;
  private namespaces: Set<string>;

  constructor(
    private context: Context,
    private extensions: TExtensions,
  ) {
    this[PrivateMethods] = {};
    this.namespaces = new Set();

    for (const extension of extensions) {
      if (extension.namespace !== undefined) {
        this.namespaces.add(extension.namespace);
        console.log('Storing methods:', extension.methods);
        const namespacedMethods = Object.fromEntries(
          Object.entries(extension.methods).map(([key, value]) => [
            `${extension.namespace}${key}`,
            value
          ])
        );
        Object.assign(this[PrivateMethods], namespacedMethods);
        Object.defineProperty(this, extension.namespace, {
          value: this.createNamespaceProxy(extension.namespace),
          enumerable: true
        });
      }
    }

    // Move the assignment of non-namespaced methods here
    Object.assign(this, ...extensions.filter(e => !e.namespace).map(e => e.methods));
  }

  private createNamespaceProxy(namespace: string) {
    return new Proxy({}, {
      get: (target, methodName: string) => {
        console.log('called');
        const namespacedMethod = `${namespace}${methodName}`;
        console.log('Looking for method:', namespacedMethod);
        console.log('Available methods:', this[PrivateMethods]);
        const method = this[PrivateMethods][namespacedMethod];
        return method.bind(this);
      }
    });
  }

  step() {
    const { extensions, context } = this;
    return createWorkflow({ extensions, context });
  }
}

function createWorkflow<
  TExtensions extends Extension<ExtensionMethods<any>>[]
>({ extensions, context = {} }: { extensions: TExtensions, context?: Context }) {
  const builder = new Builder<TExtensions>(context, extensions);

  // Simplify extension handling since we no longer need to handle functions
  Object.assign(builder, ...extensions.filter(e => !!e.namespace).map(e => e.methods));

  type ExtendedBuilder = Chainable<Builder & UnionToIntersection<TExtensions[number]['namespace']>>;

  return builder as ExtendedBuilder;
}

const createExtension = <
  TNamespace extends string,
  TExtensionMethods extends ExtensionMethods<Builder<any>>
>(
  namespaceOrExtension: TNamespace | TExtensionMethods,
  maybeExtension?: TExtensionMethods
): Extension<TExtensionMethods, TNamespace > => {
  if (typeof namespaceOrExtension === 'string') {
    return {
      namespace: namespaceOrExtension,
      methods: maybeExtension!
    };
  }
  return {
    methods: namespaceOrExtension
  };
};

const workflow = <
  TExtensions extends Extension<ExtensionMethods<Builder<any>>>[]
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
const test3 = createExtension('nested', {
  nestedTest() {
    console.log('nestedTest')
    console.log(this);
    return this.step();
  },
});

console.log(test3);

type TEST3 = typeof test3;

const customExtensions = [
  test3,
  createExtension({
    method1() {
      console.log('method 1')
      return this.step();
    },
  }),
];

type EXT = typeof customExtensions[number];

type CUSTOM = UnionToIntersection<typeof customExtensions[number]>

const extended = workflow({ extensions: customExtensions });
// Now we can chain everything
const final = extended;


const builder = new Builder({}, customExtensions);

  // Simplify extension handling since we no longer need to handle functions
Object.assign(builder, ...customExtensions.filter(e => !!e.namespace).map(e => e.methods));

type ExtendedBuilder = Chainable<Builder & UnionToIntersection<typeof customExtensions[number]['methods']>>;

console.log((builder as any).nested.nestedTest().method1())