import { JsonObject } from "./types";

type Context = JsonObject;

type Builder<
  T,
  ContextIn extends Context = Context
> = {
  context: ContextIn;
  step: <NewContext extends Context>(
    handler: (context: ContextIn) => NewContext
  ) => Builder<T, NewContext>;
} & {
  [K in keyof T]: T[K] extends { [key: string]: (...args: any[]) => any }
    ? {
        [M in keyof T[K]]: T[K][M] extends (...args: infer A) => any
          ? (...args: A) => Builder<T, ContextIn>
          : T[K][M];
      }
    : T[K] extends (...args: any[]) => any
    ? (...args: Parameters<T[K]>) => Builder<T, ContextIn>
    : T[K];
};

type ExtensionMethod<
  T extends Extension[] = any,
  ContextIn extends Context = {},
> = (
  this: Builder<BaseBuilder<T, ContextIn> & T>,
  ...args: any[]
) => Builder<BaseBuilder<T, ContextIn> & T>;

interface Extension {
  [key: string]: ExtensionMethod | {
    [method: string]: ExtensionMethod;
  };
}

type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

type Merge<T> = T extends object ? {
  [K in keyof T]: T[K]
} & {} : T;

const createExtension = <T extends Extension>(ext: T): T => ext;

class BaseBuilder<
  TExtensions extends Extension[],
  ContextIn extends Context,
> {
  constructor(
    public extensions: TExtensions,
    public context: ContextIn = {} as ContextIn,
  ) { }

  step(
    handler: (context: ContextIn) => Context
  ) {
    const newContext = handler(this.context);
    return createBuilder(
      new BaseBuilder(this.extensions, newContext)
    );
  }
}

function createBuilder<
  TExtensions extends Extension[],
  ContextIn extends Context,
>(
  builder: BaseBuilder<TExtensions, ContextIn>,
): Builder<Merge<Merge<UnionToIntersection<TExtensions[number]>> & BaseBuilder<TExtensions, ContextIn>>, ContextIn> {
  const { extensions } = builder;
  const proxyInstance = new Proxy(builder, {
    get(target: any, prop: string | symbol) {
      // First check if it's a property on the original builder
      if (prop in target) {
        const value = target[prop];
        if (typeof value === 'function') {
          return function (this: any, ...args: any[]) {
            const result = value.apply(proxyInstance, args);
            return result === target ? proxyInstance : result;
          };
        }
        return value;
      }

      // Look for the property in our extensions
      for (const ext of extensions) {
        if (prop in ext) {
          const value = ext[prop as string];

          // Handle flat methods
          if (typeof value === 'function') {
            return function (this: any, ...args: any[]) {
              return value.apply(proxyInstance, args);
            };
          }

          // Handle namespaced methods
          return new Proxy(value, {
            get(target: any, methodName: string | symbol) {
              const method = target[methodName as string];
              if (typeof method === 'function') {
                return function (this: any, ...args: any[]) {
                  return method.apply(proxyInstance, args);
                };
              }
              return method;
            }
          });
        }
      }
    }
  });

  return proxyInstance;
}

const extensions = [createExtension({
  slack: {
    message(text: string) {
      return this.step((context) => ({ ...context, message: text }));
    }
  }
}), createExtension({
  files: {
    file(name: string) {
      return this.step((context) => ({ ...context, file: name }));
    }
  }
}), createExtension({
  method() {
    return this.step((context) => ({ ...context, method: true }));
  }
})];

const builder = createBuilder(
  new BaseBuilder(extensions),
);

const finished = builder
  .step((context) => ({ one: 'one' }))
  .step((context) => ({ ...context, two: 'two' }))
  .step((context) => context)
  .method()
  .slack.message('Hello')
  .slack.message('again')
  .files.file('name')
  .step(context => context)
  .files.file('name');