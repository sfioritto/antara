import { JsonObject } from "./types";

// First, we define the base Builder class type
type Chainable<T> = {
  [K in keyof T]: T[K] extends { [key: string]: (...args: any[]) => any }
    ? {
        [M in keyof T[K]]: T[K][M] extends (...args: infer A) => any
          ? (...args: A) => Chainable<T>
          : T[K][M];
      }
    : T[K];
};

// The base Builder class - keeps things minimal with just the step method
class Builder<T = any> {
  step(message: string = ''): Chainable<Builder<T> & T> {
    console.log('Step:', message);
    return this as Chainable<Builder<T> & T>;
  }
}

type ExtensionMethod<T = any> = (
  this: Chainable<Builder<T> & T>,
  ...args: any[]
) => Chainable<Builder<T> & T>;

interface Extension {
  [namespace: string]: {
    [method: string]: ExtensionMethod;
  };
}

type UnionToIntersection<U> = (
  U extends unknown ? (arg: U) => void : never
) extends (arg: infer I) => void
  ? I
  : never;

const createExtension = <T extends Extension>(ext: T): T => ext;

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
})];

function extendBuilder<TExtensions extends Extension[]>(
  builder: Builder<UnionToIntersection<TExtensions[number]>>,
  extensions: TExtensions,
): Chainable<Builder<UnionToIntersection<TExtensions[number]>> & UnionToIntersection<TExtensions[number]>> {
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

      // Look for the namespace in our extensions
      const extension = extensions.find(ext => prop in ext);
      if (extension) {
        const namespace = extension[prop as string];
        return new Proxy(namespace, {
          get(target: any, methodName: string | symbol) {
            const method = namespace[methodName as string];
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
  });

  return proxyInstance;
}

// type TExtensions = UnionToIntersection<typeof extensions[number]>;

// Remove the createExtension helper and type TExtensions
// Create and extend our builder
const builder = extendBuilder(
  new Builder<UnionToIntersection<typeof extensions[number]>>(),
  extensions
);

// This entire chain now works with full TypeScript hints
const finished = builder
  .step('Start')
  .slack.message('Hello')
  .slack.message('again')
  .files.file('name');