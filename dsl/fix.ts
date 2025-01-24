import { JsonObject } from "./types";

class Extendable {
  extend<T extends object>(extension: T): this & T {
    Object.assign(this, extension);
    return this as this & T;
  }
}

// Usage
const base = new Extendable();

// This is still just an Extendable, so no new methods
// base.newMethod1(); // Error in TS

const extended1 = base.extend({
  newMethod1() {
    return this;
  },
  newMethod2() {
    console.log("method 2")
  }
});

// `extended1` now knows `newMethod1` exists
extended1.newMethod1(); // works
// You can chain calls:
const extended3 = extended1.extend({
  newMethod3() {
    console.log("method3");
  }
});

extended3.newMethod1(); // still works
extended3.newMethod2(); // works as well
extended3.newMethod3();
