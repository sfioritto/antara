import { JsonObject } from "./types";

// First, we define the base Builder class type
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

type ExtensionMethod<T = any> = (
  this: Chainable<Builder & T>,
  ...args: any[]
) => Chainable<Builder & T>;

// Update the Extension type to allow both nested and flat methods
interface Extension {
  [key: string]: ExtensionMethod | {
    [method: string]: ExtensionMethod;
  };
}

// The base Builder class - keeps things minimal with just the step method
class Builder {
  step(message: string = '') {
    console.log('Step:', message);
    return this;
  }
}

type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

const createExtension = <T extends Extension>(ext: T): T => ext;

function extendBuilder<TExtensions extends Extension[]>(
  builder: Builder,
  extensions: TExtensions,
): Chainable<Builder & UnionToIntersection<TExtensions[number]>> {
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

const builder = extendBuilder(
  new Builder(),
  extensions
);

// This entire chain now works with full TypeScript hints
const finished = builder
  .step('Start')
  .method()
  .step('step again')
  .slack.message('Hello')
  .slack.message('again')
  .files.file('name');