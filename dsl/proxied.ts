import { JsonObject } from "./types";

type Context = JsonObject;

type Chainable<TBase, TContext extends Context> = {
  step: AddStep<TContext, TBase>;
} & {
  [K in keyof TBase]: TBase[K] extends (...args: any[]) => any
    ? (...args: Parameters<TBase[K]>) => Chainable<TBase, ReturnType<TBase[K]>>
    : TBase[K];
};

// type UnionToIntersection<U> = (
//   U extends unknown ? (arg: U) => void : never
// ) extends (arg: infer I) => void
//   ? I
//   : never;

// type Merge<T> = T extends object ? {
//   [K in keyof T]: T[K]
// } & {} : T;

// type ExtensionMethod = <TContextIn extends Context>(
//   ...args: any[]
// ) => ((context: TContextIn) => Context);

// type Extension = {
//   [methodOrNamespace: string]: ExtensionMethod | {
//     [method: string]: ExtensionMethod
//   }
// }

// const createExtension = <TExtension extends Extension>(ext: TExtension): TExtension => ext;

// type BuilderBase<TExtensions extends Extension[], TContextIn extends Context> = {
//   step: <TContextOut extends Context>(
//     handler: (context: TContextIn) => TContextOut
//   ) => Builder<TExtensions, TContextOut>;
//   [key: string]: any;
// }

// type Builder<TExtensions extends Extension[], TContextIn extends Context> =
//   BuilderBase<TExtensions, TContextIn> &
//   Chainable<BuilderBase<TExtensions, TContextIn> & Merge<UnionToIntersection<TExtensions[number]>>>;

// function createBuilder<
//   TExtensions extends Extension[],
//   TContextIn extends Context = {}
// >(
//   extensions: TExtensions,
//   context: TContextIn = {} as TContextIn
// ) {
//   const builder = {
//     step: function <TContextOut extends Context>(
//       handler: (context: TContextIn) => TContextOut
//     ) {
//       const newContext = handler(context);
//       console.log(newContext);
//       return createBuilder<TExtensions, TContextOut>(extensions, newContext);
//     }
//   } as Builder<TExtensions, TContextIn>;

//   // Bind extensions to the builder
//   for (const extension of extensions) {
//     for (const [key, value] of Object.entries(extension)) {
//       if (typeof value === 'function') {
//         const methodName = key;
//         const method = value;
//         type Params = Parameters<typeof method>;
//         type ContextOut = ReturnType<ReturnType<typeof method>>;
//         (builder as any)[methodName] = (args: Params) => builder.step<ContextOut>(method(args));
//       } else {
//         const namespace = key;
//         const namespacedMethods = value;
//         (builder as any)[namespace] = {};
//         for (const [methodName, nestedMethod] of Object.entries(namespacedMethods)) {
//           if (typeof nestedMethod === 'function') {
//             type Params = Parameters<typeof nestedMethod>;
//             type ContextOut = ReturnType<ReturnType<typeof nestedMethod>>;
//             (builder as any)[namespace][methodName] = (args: Params) => builder.step<ContextOut>(nestedMethod(args));
//           }
//         }
//       }
//     }
//   }

//   return builder as Builder<TExtensions, TContextIn>;
// }

// const slackExtension = createExtension({
//   slack: {
//     message(text: string) {
//       return (context: Context) => ({ ...context, slack: text });
//     }
//   }
// });

// type Return = ReturnType<ReturnType<typeof slackExtension.slack.message>>

// const slackBuilder = createBuilder([slackExtension]);
// slackBuilder.slack.message('cool').step(context => context)

// const extensions = [createExtension({
//   slack: {
//     message(text: string) {
//       return (context) => ({ ...context, slack: text });
//     }
//   }
// }), createExtension({
//   files: {
//     file(name: string) {
//       return (context) => ({ ...context, file: name });
//     }
//   }
// }), createExtension({
//   method() {
//     return (context) => ({ method: 'method', ...context })
//   }
// })];

// const builder = createBuilder(extensions);
// builder
//   .step(context => ({ ...context, new: 'context' }))
//   .step(context => ({ ...context, nextStep: 'next' }))
//   .step(context => ({ ...context, cool: 'cool' }))
//   .method()
//   .step(context => ({ ...context, cool: 'cool' }))
//   .files.file('file name')
//   .slack.message('hi again')
//   .slack.message('hi')
//   .step(context => ({ ...context, cool: 'cool' }))

type AddStep<TContext extends Context, TBase> = {
  <TContextOut extends Context>(
    title: string,
    action: (context: TContext) => TContextOut
  ): Chainable<TBase, TContextOut>;
}

type Extension = { [name: string]: (...args: any[]) => (context: Context) => Context };

type StepBlock<ContextIn extends Context> = {
  title: string;
  action: (context: ContextIn) => Context | Promise<Context>;
}

type Base<ContextIn extends Context> = {
  step: AddStep<ContextIn, Extension>;
}

const createBase = <
  ContextIn extends Context,
  TExtension extends Extension,
>(
  extension: TExtension,
  context: ContextIn,
  steps: StepBlock<any>[] = []
): Chainable<TExtension, ContextIn> => {
  const base = {
    step: (<TContextOut extends Context>(
      title: string,
      action: (context: ContextIn) => TContextOut
    ) => {
      const newStep = { title, action };
      return createBase<TContextOut, TExtension>(extension, action(context), [...steps, newStep]);
    }) as AddStep<ContextIn, TExtension>,
    ...extension
  } as Chainable<TExtension, ContextIn>;

  return base;
}

const simpleExtension = {
  simple: (message: string) => {
    return (context: Context) => ({ ...context, message });
  }
}

const myBase = createBase(simpleExtension, {}).simple('message')
  .step('Add coolness', context => ({ cool: 'ness', ...context }))
  .step('Identity', context => ({ bad: 'news', ...context })).step('final step', context => context).simple('maybe not').step('final final step v3', context => context)
