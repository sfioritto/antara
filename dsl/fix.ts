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
    return this;
  }
});

// `extended1` now knows `newMethod1` exists
extended1.newMethod1(); // works
// You can chain calls:
const extended3 = extended1.extend({
  newMethod3() {
    return this;
  }
});

extended3.newMethod1().newMethod2() // works
extended3.newMethod2().newMethod1(); // works as well
extended3.newMethod1().newMethod3(); // does not work
extended3.newMethod3().newMethod3(); // works
extended3.newMethod3().newMethod1(); // does not work
