import { JsonObject } from "./types";

type Context = JsonObject;

type Action<ActionResult> = () => ActionResult;

type Reducer<
  ActionResult,
  ContextIn extends Context,
  ContextOut extends Context> = (result: ActionResult, context: ContextIn) => ContextOut;

type Builder<
  ContextIn extends Context,
  TExtensionsBlock extends ExtensionsBlock<Extension[]>,
> = {
  step<ContextOut extends Context, ActionResult = any>(
    title: string,
    action: Action<ActionResult>,
    reduce: Reducer<ActionResult, ContextIn, ContextOut>,
  ): ExtendedBuilder<ContextOut, TExtensionsBlock>,
  run(): void,
}

type ExtendedBuilder<
  ContextIn extends Context,
  TExtensionsBlock extends ExtensionsBlock<Extension[]>,
> = TExtensionsBlock & Builder<ContextIn, TExtensionsBlock>

interface StepBlock<
  ActionResult,
  ContextIn extends Context,
  ContextOut extends Context
> {
  title: string,
  action: Action<ActionResult>,
  reduce: Reducer<ActionResult, ContextIn, ContextOut>,
}

type BuilderReturningFunction<T extends Context> = (...args: any[]) => ExtendedBuilder<T, any>;

type ExtensionMethod<T extends Context> = BuilderReturningFunction<T> | {
  [key: string]: ExtensionMethod<T>;
}

type Extension = <
  ContextIn extends Context,
  ExtensionsBlock extends { [key: string]: ExtensionMethod<ContextIn> }
>(builder: Builder<ContextIn, ExtensionsBlock>) => {
  [KEY: string]: ExtensionMethod<ContextIn>
};

type ExtensionsBlock<
  Extensions extends Extension[]
> = Extensions extends Array<infer E>
  ? E extends Extension
    ? ReturnType<E>
    : never
  : never;

type BasicExtensions<ContextIn extends Context> = {
  file: {
    write: () => ExtendedBuilder<ContextIn & { file: string }, BasicExtensions<ContextIn & { file: string }>>,
  },
  log: () => ExtendedBuilder<ContextIn & { logger: string }, BasicExtensions<ContextIn & { logger: string }>>,
}

const fileExtension: Extension = (builder) => ({
  file: {
    write: () => builder.step(
      "file step",
      () => console.log("file action"),
      (result, context) => ({ ...context, file: "file content" })
    )
  }
});

const loggerExtension: Extension = (builder) => ({
  log: () => builder.step(
    "Log step",
    () => console.log("logging action"),
    (result, context) => ({ ...context, logger: "log step" })
  )
});

// function createExtensions<ContextIn extends Context>(
//   builder: Builder<ContextIn, BasicExtensions<ContextIn>>
// ): BasicExtensions<ContextIn> {
//   return {
//     file: {
//       write() {
//         return builder.step(
//           "file step", () => console.log("file action"),
//           (result, context) => {
//             console.log('context in file', context)
//             return {
//               ...context,
//               file: "file content",
//             };
//           }
//         )
//       }
//     },
//     log() {
//       return builder.step(
//         "Log step", () => console.log("logging action"),
//         (result: any, context) => {
//           return {
//             ...context,
//             logger: "log step",
//           }
//         }
//       );
//     }
//   };
// }

function createBuilder<
  ContextIn extends Context,
  TExtensionsBlock extends ExtensionsBlock<Extension[]>,
>({
  steps = [],
  extensions = [],
}: {
  steps?: StepBlock<Action<any>, Context, Context>[];
  extensions?: Extension[];
}): ExtendedBuilder<ContextIn, TExtensionsBlock> {
  const builder: Builder<ContextIn, TExtensionsBlock> = {
    step(title: string, action, reduce) {
      const stepBlock = {
        title,
        action,
        reduce
      };
      type ContextOut = ReturnType<typeof reduce>;
      return createBuilder<ContextOut, TExtensionsBlock>({
        steps: [...steps, stepBlock] as StepBlock<Action<any>, Context, Context>[],
        extensions,
      });
    },
    run() {
      let context = {};
      for (const { title, action, reduce } of steps) {
        const result = action();
        context = reduce(result, context);
        console.log(JSON.stringify(context, null, 2));
      }
    }
  };

  let extensionsBlock = {};
  for (const extension of extensions) {
    extensionsBlock = {
      ...extensionsBlock,
      ...extension(builder)
    }
  }

  return {
    ...builder,
    ...extensionsBlock,
  } as ExtendedBuilder<ContextIn, TExtensionsBlock>

}

function createWorkflow<
  ContextIn extends Context,
  TExtensions extends Extension[] | []
>({
  steps = [],
  extensions = [] as TExtensions,
}: {
  steps?: StepBlock<Action<any>, Context, Context>[];
  extensions?: TExtensions;
}): ExtendedBuilder<ContextIn, ExtensionsBlock<Extension[]>> {
  type InferredExtensionsBlock = ExtensionsBlock<typeof extensions>

  return createBuilder<ContextIn, InferredExtensionsBlock>({ steps, extensions });
}

const workflow = createWorkflow({ extensions: [fileExtension, loggerExtension]});
workflow
  .log()
  .file.write()
  .step('first', () => 'first step action', (result, context) => ({ ...context, step1: result + context.logger }))
  .step('second', () => 'second step action', (result, context) => ({ ...context, step2: result + context.step1 }))
  .step('third', () => 'third step action', (result, context) => ({ ...context, step3: result + context.step2 })).run();