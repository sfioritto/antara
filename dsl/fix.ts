import { JsonObject } from "./types";

class Builder {
  extend(extension: any) {
    Object.assign(this, extension)
    return this;
  }
  step() {
    console.log('step')
    return this;
  }
}

const simpleExtension: any = {
  method() {
    console.log('method')
    return this.step();
  }
}

const secondExtension: any = {
  second() {
    console.log('second');
    return this.step();
  }
}

const builder = new Builder() as any;
builder.extend(simpleExtension).extend(secondExtension).step().method().second();