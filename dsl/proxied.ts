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

type ExtensionMethod = <TExtensions extends Extension[], TContextIn extends Context>(
  this: Builder<TExtensions, TContextIn>,
  ...args: any[]
) => Builder<TExtensions, any>;

type Extension = {
  [method: string]: ExtensionMethod | {
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
      return createBuilder<TExtensions, typeof newContext>(extensions, newContext);
    }
  } as Builder<TExtensions, TContextIn>;

  // Bind extensions to the builder
  for (const ext of extensions) {
    for (const [key, value] of Object.entries(ext)) {
      if (typeof value === 'function') {
        // Bind flat methods
        (builder as any)[key] = value.bind(builder);
      } else {
        // Handle namespaced methods
        (builder as any)[key] = {};
        for (const [methodName, method] of Object.entries(value)) {
          builder[key][methodName] = method.bind(builder);
        }
      }
    }
  }

  return builder as Builder<TExtensions, TContextIn>;
}

const extensions = [createExtension({
  slack: {
    message(text: string) {
      return this.step((context) => ({ ...context, slack: text }));
    }
  }
}), createExtension({
  files: {
    file(name: string) {
      return this.step((context) => ({ ...context, file: name }))
    }
  }
}), createExtension({
  method() {
    return this.step((context) => ({ method: 'method', ...context }))
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

