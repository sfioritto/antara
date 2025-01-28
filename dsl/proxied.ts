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

// type ExtensionMethod<T = any> = (
//   this: ExtendedBuilder<BaseBuilder & T>,
//   ...args: any[]
// ) => ExtendedBuilder<BaseBuilder & T>;

// interface Extension {
//   [key: string]: ExtensionMethod | {
//     [method: string]: ExtensionMethod;
//   };
// }

type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

type Merge<T> = T extends object ? {
  [K in keyof T]: T[K]
} & {} : T;

// type MergeExtensions<TExtensions extends Extension[]> = Merge<UnionToIntersection<TExtensions[number]>>;

type ExtensionMethod = (this: Builder, ...args: any[]) => Builder;

type Extension = {
  [method: string]: ExtensionMethod | {
    [method: string]: ExtensionMethod
  }
}
const createExtension = <TExtension extends Extension>(ext: TExtension): TExtension => ext;

type Builder = {
  step: <ContextOut extends Context>(handler: (context: Context) => ContextOut) => Builder;
} & Record<string, any>;

function createBuilder<TExtensions extends Extension[]>(extensions: TExtensions): Chainable<Builder & Merge<UnionToIntersection<TExtensions[number]>>> {
  const context: Context = {};

  const builder: Builder = {
    step: function<ContextOut extends Context>(handler: (context: Context) => ContextOut) {
      const newContext = handler(context);
      console.log(newContext);
      return builder;
    }
  };

  // Bind extensions to the builder
  for (const ext of extensions) {
    for (const [key, value] of Object.entries(ext)) {
      if (typeof value === 'function') {
        // Bind flat methods
        builder[key] = value.bind(builder);
      } else {
        // Handle namespaced methods
        builder[key] = {};
        for (const [methodName, method] of Object.entries(value)) {
          builder[key][methodName] = method.bind(builder);
        }
      }
    }
  }

  return builder as Chainable<Builder & Merge<UnionToIntersection<TExtensions[number]>>>;
}

const extensions = [createExtension({
  slack: {
    message(text: string) {
      return this.step((context) => ({ slack: text, ...context}));
    }
  }
}), createExtension({
  files: {
    file(name: string) {
      return this.step((context) => ({ file: name, ...context}))
    }
  }
}), createExtension({
  method() { return this.step((context) => ({ method: 'method', ...context})) }
})];

const builder = createBuilder(extensions);
builder
  .files.file('file name')
  .slack.message('hi')
  .step(context => ({ new: 'context' }))
  .method()
  .slack.message('hi again');