import { JsonObject } from "./types";

// Define the shape of what will be added when extended
interface ExtendedMethods {
    extended(): void;
}

// Base class with the extend functionality
class Extendable {
    // The extend method returns 'this & ExtendedMethods' to indicate
    // the return type is the original object plus the new methods
    extend(extended: any): this & ExtendedMethods {
        // Add the new method to the instance
      (this as any).extended = extended;

      return this as this & ExtendedMethods;
    }
}

const extendedMethod = () => console.log('extended');
// Example usage with type checking
const obj = new Extendable();

// This would cause a TypeScript error because 'extended' doesn't exist yet
// obj.extended();  // Error: Property 'extended' does not exist

// After calling extend(), TypeScript knows the method exists
const extended = obj.extend(extendedMethod)
extended.extended();  // Works fine

// You can also chain it
new Extendable().extend(extendedMethod).extended();