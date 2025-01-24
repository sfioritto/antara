import { JsonObject } from "./types"

function createBuilder(...extensions: any[]) {
  const builder = {
    step: () => {
      console.log('base step')
      return createBuilder(...extensions);
    },
  };

  return extensions.reduce(
    (acc, ext) => ({
      ...acc,
      ...ext(builder)
    }),
    builder
  );
}

const oneExtension = (builder: any) => ({
  one: () => {
    console.log('one');
    return builder.step();
  }
});

const twoExtension = (builder: any) => ({
  two: () => {
    console.log('two')
    return builder.step();
  }
});

// Usage
const builder = createBuilder(oneExtension, twoExtension);
builder.step().one().two().step().one().two()