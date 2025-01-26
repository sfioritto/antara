import { JsonObject } from "./types";

// First, we define the base Builder class type
type Chainable<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => any
    ? (this: Chainable<T>, ...args: A) => Chainable<T>
    : T[K];
};

// The base Builder class - keeps things minimal with just the step method
class Builder {
  step(message: string = '') {
    console.log('Step:', message);
    return this;
  }
}

type ExtensionMethod = (this: Chainable<Builder & Record<string, Extension>>, ...args: any[]) => Chainable<Builder & Record<string, Extension>>;

interface Extension {
  [namespace: string]: {
    [method: string]: ExtensionMethod;
  };
}

// Replace createExtension and slackExtension with:
const extensions: Extension[] = [{
  slack: {
    message(text: string) {
      return this.step(`Slack message: ${text}`);
    }
  }
}];

// Update the extendBuilder function
function extendBuilder(
  builder: Builder,
  extensions: Extension[]
) {
  const proxyInstance = new Proxy(builder, {
    get(target: any, prop: string | symbol) {
      // First check if it's a property on the original builder
      if (prop in target) {
        const value = target[prop];
        if (typeof value === 'function') {
          return function(this: any, ...args: any[]) {
            const result = value.apply(target, args);
            return result === target ? proxyInstance : result;
          };
        }
        return value;
      }

      // Look for the namespace in our extensions
      const extension = extensions.find(ext => prop in ext);
      if (extension) {
        return new Proxy(extension[prop as string], {
          get(target: any, methodName: string | symbol) {
            const method = extension[prop as string][methodName as string];
            if (typeof method === 'function') {
              return method.bind(proxyInstance);
            }
            return method;
          }
        });
      }
    }
  }) as Chainable<Builder & Record<string, Extension>>;

  return proxyInstance;
}

// Remove the createExtension helper and type TExtensions
// Create and extend our builder
const builder = extendBuilder(new Builder(), extensions);

// This entire chain now works with full TypeScript hints
builder
  .step('Start')
  .slack.message('Hello')
  .step('Middle')
  .slack.message('World');