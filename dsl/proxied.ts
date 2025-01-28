import { JsonObject } from "./types";

type Context = JsonObject;

type Chainable<T> = {
  [K in keyof T]: T[K] extends { [key: string]: (...args: any[]) => any }
    ? {
        [M in keyof T[K]]: T[K][M] extends (...args: infer A) => any
          ? (...args: A) => Chainable<T>
          : T[K][M];
      }
    : T[K] extends (...args: any[]) => any
    ? (...args: Parameters<T[K]>) => Chainable<T>
    : T[K];
};

type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

type Merge<T> = T extends object ? {
  [K in keyof T]: T[K]
} & {} : T;

type ExtensionMethod = <TContextIn extends Context>(
  ...args: any[]
) => (context: TContextIn) => Context

type Extension = {
  [methodOrNamespace: string]: ExtensionMethod | {
    [method: string]: ExtensionMethod
  }
}
const createExtension = <TExtension extends Extension>(ext: TExtension): TExtension => ext;

type BuilderBase<TExtensions extends Extension[], TContextIn extends Context> = {
  step: <TContextOut extends Context>(
    handler: (context: TContextIn) => TContextOut
  ) => Builder<TExtensions, TContextOut>;
  [key: string]: any;
}

type Builder<TExtensions extends Extension[], TContextIn extends Context> =
  BuilderBase<TExtensions, TContextIn> &
  Chainable<BuilderBase<TExtensions, TContextIn> & Merge<UnionToIntersection<TExtensions[number]>>>;

function createBuilder<
  TExtensions extends Extension[],
  TContextIn extends Context = {}
>(
  extensions: TExtensions,
  context: TContextIn = {} as TContextIn
) {
  const builder = {
    step: function <TContextOut extends Context>(
      handler: (context: TContextIn) => TContextOut
    ) {
      const newContext = handler(context);
      console.log(newContext);
      return createBuilder<TExtensions, TContextOut>(extensions, newContext);
    }
  } as Builder<TExtensions, TContextIn>;

  // Bind extensions to the builder
  for (const extension of extensions) {
    for (const [key, value] of Object.entries(extension)) {
      if (typeof value === 'function') {
        const methodName = key;
        const method = value;
        type Params = Parameters<typeof method>;
        type ContextOut = ReturnType<ReturnType<typeof method>>;
        (builder as any)[methodName] = (args: Params) => builder.step<ContextOut>(method(args));
      } else {
        const namespace = key;
        const namespacedMethods = value;
        (builder as any)[namespace] = {};
        for (const [methodName, nestedMethod] of Object.entries(namespacedMethods)) {
          if (typeof nestedMethod === 'function') {
            type Params = Parameters<typeof nestedMethod>;
            type ContextOut = ReturnType<ReturnType<typeof nestedMethod>>;
            (builder as any)[namespace][methodName] = (args: Params) => builder.step<ContextOut>(nestedMethod(args));
          }
        }
      }
    }
  }

  return builder as Builder<TExtensions, TContextIn>;
}

const extensions = [createExtension({
  slack: {
    message(text: string) {
      return (context) => ({ ...context, slack: text });
    }
  }
}), createExtension({
  files: {
    file(name: string) {
      return (context) => ({ ...context, file: name });
    }
  }
}), createExtension({
  method() {
    return (context) => ({ method: 'method', ...context })
  }
})];

const builder = createBuilder(extensions);
builder
  .step(context => ({ ...context, new: 'context' }))
  .step(context => ({ ...context, nextStep: 'next' }))
  .step(context => ({ ...context, cool: 'cool' }))
  .method()
  .step(context => ({ ...context, cool: 'cool' }))
  .files.file('file name')
  .slack.message('hi again')
  .slack.message('hi')
  .step(context => ({ ...context, cool: 'cool' }))

