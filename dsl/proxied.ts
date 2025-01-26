import { JsonObject } from "./types";

type Context = JsonObject;

type Builder<T> = {
  [K in keyof T]: T[K] extends { [key: string]: (...args: any[]) => any }
    ? {
        [M in keyof T[K]]: T[K][M] extends (...args: infer A) => any
          ? (...args: A) => Builder<T>
          : T[K][M];
      }
    : T[K] extends (...args: any[]) => any
    ? (...args: Parameters<T[K]>) => Builder<T>
    : T[K];
};

type ExtensionMethod<T extends Extension[] = any> = (
  this: Builder<BaseBuilder<T> & T>,
  ...args: any[]
) => Builder<BaseBuilder<T> & T>;

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

class BaseBuilder<TExtensions extends Extension[]> {
  constructor(private extensions: TExtensions) { }
  step(message: string = '') {
    console.log('Step:', message);
    return createBuilder(new BaseBuilder(this.extensions), this.extensions);
  }
}

function createBuilder<TExtensions extends Extension[]>(
  builder: BaseBuilder<TExtensions>,
  extensions: TExtensions,
): Builder<Merge<Merge<UnionToIntersection<TExtensions[number]>> & BaseBuilder<TExtensions>>> {
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
      return this.step(`Slack message: ${text}`);
    }
  }
}), createExtension({
  files: {
    file(name: string) {
      return this.step(`File saved: ${name}`)
    }
  }
}), createExtension({ method() { return this.step('base method') } })];

const builder = createBuilder(
  new BaseBuilder(extensions),
  extensions
);

const finished = builder
  .step('Start')
  .method()
  .step('step again')
  .slack.message('Hello')
  .slack.message('again')
  .files.file('name');