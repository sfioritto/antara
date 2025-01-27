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

class Builder {
  constructor(
    private context: Context = {},
    private extensions: Extension[] = []
  ) {
    const proxyInstance =  new Proxy(this, {
      get(baseBuilder: Builder, prop: string) {
        // First check if it's a property on the original builder
        if (prop in baseBuilder) {
          const value = baseBuilder[prop as keyof Builder];
          if (typeof value === 'function') {
            return function (...args: any[] | any) {
              const result = value.apply(proxyInstance, args);
              return result;
            };
          }
          return value;
        }

        // Look for the property in our extensions
        for (const ext of extensions) {
          if (prop in ext) {
            const value = ext[prop];
            // Handle flat methods
            if (typeof value === 'function') {
              return function (...args: any[]) {
                return (value as Function).apply(proxyInstance, args);
              };
            }
            // Handle namespaced methods
            return new Proxy(value, {
              get(namespacedBuilder, methodName: string) {
                const method = namespacedBuilder[methodName];
                if (typeof method === 'function') {
                  return function (...args: any[]) {
                    return (method as Function).apply(proxyInstance, args);
                  };
                }
                return this;
              }
            });
          }
        }
      }
    });

    return proxyInstance;
  }

  step<ContextOut extends Context>(handler: (context: Context) => ContextOut) {
    const newContext = handler(this.context);
    console.log(newContext);
    return this;
  }
}

const createBuilder = <TExtensions extends Extension[]>(extensions: TExtensions): Chainable<Builder & Merge<UnionToIntersection<TExtensions[number]>>> => {
  const builder = new Builder({}, extensions);
  return builder as Chainable<Builder & Merge<UnionToIntersection<TExtensions[number]>>>;
}

// function createBuilder<TExtensions extends Extension[]>(
//   builder: BaseBuilder,
//   extensions: TExtensions,
// ): ExtendedBuilder<MergeExtensions<TExtensions> & BaseBuilder> {
//   const proxyInstance = new Proxy(builder, {
//     get(target: any, prop: string | symbol) {
//       // First check if it's a property on the original builder
//       if (prop in target) {
//         const value = target[prop];
//         if (typeof value === 'function') {
//           return function (this: any, ...args: any[]) {
//             const result = value.apply(proxyInstance, args);
//             return result === target ? proxyInstance : result;
//           };
//         }
//         return value;
//       }

//       // Look for the property in our extensions
//       for (const ext of extensions) {
//         if (prop in ext) {
//           const value = ext[prop as string];

//           // Handle flat methods
//           if (typeof value === 'function') {
//             return function (this: any, ...args: any[]) {
//               return value.apply(proxyInstance, args);
//             };
//           }

//           // Handle namespaced methods
//           return new Proxy(value, {
//             get(target: any, methodName: string | symbol) {
//               const method = target[methodName as string];
//               if (typeof method === 'function') {
//                 return function (this: any, ...args: any[]) {
//                   return method.apply(proxyInstance, args);
//                 };
//               }
//               return method;
//             }
//           });
//         }
//       }
//     }
//   });

//   return proxyInstance;
// }

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
builder.files.file('file name').slack.message('hi').step(context => ({ new: 'context' })).method().slack.message('hi again');
// const builder = createBuilder(
//   new BaseBuilder(),
//   extensions
// );

// const finished = builder
//   .step('Start')
//   .method()
//   .step('step again')
//   .slack.message('Hello')
//   .slack.message('again')
//   .files.file('name');