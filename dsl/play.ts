type Context = Record<string, string | number | boolean>

// const createExtension = <T extends Extension>(fn: T): T => fn;

// const firstExtension = createExtension((builder) => ({
//   first: () => builder.step
//     ({ first: 'first' })
// }));

// const secondExtension = createExtension(
//   (builder) => ({
//     second: () => builder.step({
//       second: 'second'
//     })
//   })
// );

