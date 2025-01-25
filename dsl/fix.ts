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

type Extension<TExtension> = {
  namespace?: string;
  methods: TExtension;
};

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);


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

    for ( const extension of extensions ) {
      if (extension.namespace !== undefined) {
        this.namespaces.add(extension.namespace);
        Object.assign(this[PrivateMethods], extension.methods);
        this.createNamespaceProxy(extension.namespace);
      }
    }
  }

  private createNamespaceProxy(namespace: string) {
    return new Proxy({}, {
      get: (target, methodName: string) => {
        const namespacedMethod = `${namespace}${methodName}`;
        // Access from our private storage instead of 'this'
        return this[PrivateMethods][namespacedMethod].bind(this);
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

  type ExtendedBuilder = Chainable<Builder & UnionToIntersection<TExtensions[number]['methods']>>;

  return builder as ExtendedBuilder;
}

const createExtension = <
  TExtension extends ExtensionMethods<Builder<any>>
>(
  namespaceOrExtension: string | TExtension,
  maybeExtension?: TExtension
): Extension<TExtension> => {
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

type CUSTOM = UnionToIntersection<typeof customExtensions[number]['methods']>

const extended = workflow({ extensions: customExtensions });
// Now we can chain everything
const final = extended.nestedTest
