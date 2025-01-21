import { JsonObject, Step } from "./types";
type Context = JsonObject;
type Action<ActionResult> = () => ActionResult;
type Reducer<
  ActionResult,
  ContextIn extends Context,
  ContextOut extends Context> = (result: ActionResult, context: ContextIn) => ContextOut;

type Builder<ContextIn extends Context> = {
  step<ContextOut extends Context, ActionResult = any>(
    title: string,
    action: Action<ActionResult>,
    reduce: Reducer<ActionResult, ContextIn, ContextOut>,
  ): ExtendedBuilder<ContextOut, BasicExtensions<ContextOut>>,
  run(): void,
}

type ExtendedBuilder<
  ContextIn extends Context,
  TExtensionsBlock extends ExtensionsBlock<Extension[]>,
> = TExtensionsBlock & Builder<ContextIn>

interface StepBlock<
  ActionResult,
  ContextIn extends Context,
  ContextOut extends Context
> {
  title: string,
  action: Action<ActionResult>,
  reduce: Reducer<ActionResult, ContextIn, ContextOut>,
}

type Extension = <
  ExtensionsBlock extends object & Record<string, any>
>(builder: ExtendedBuilder<Context, ExtensionsBlock>) => ExtensionsBlock & {
  [KEY: string]: (...args: any) => ExtendedBuilder<Context, ExtensionsBlock>
};

type ExtensionsBlock<
  Extensions extends Extension[]
> =
  Extensions[number] extends (...args: any) => infer ReturnType ? ReturnType : never;


// const fileExtension: Extension = (builder) => {
//   return {
//     file: (name: string, path: string) => {
//       console.log(`${name}: ${path}`);
//       return builder;
//     }
//   }
// }



type BasicExtensions<ContextIn extends Context> = {
  file: () => ExtendedBuilder<ContextIn & { file: string }, BasicExtensions<ContextIn & { file: string }>>,
  log: () => ExtendedBuilder<ContextIn & { logger: string }, BasicExtensions<ContextIn & { logger: string }>>,
}

function createExtensions<ContextIn extends Context>(
  builder: Builder<ContextIn>
): BasicExtensions<ContextIn> {
  return {
    file() {
      return builder.step(
        "file step", () => console.log("file action"),
        (result, context) => {
          console.log('context in file', context)
          return {
            ...context,
            file: "file content",
          };
        }
      )
    },
    log() {
      return builder.step(
        "Log step", () => console.log("logging action"),
        (result: any, context) => {
          return {
            ...context,
            logger: "log step",
          }
        }
      );
    }
  };
}

function createWorkflow<
  ContextIn extends Context,
>(
  steps: StepBlock<Action<any>, Context, Context>[] = [],
  extensions: Extension[] = [],
): ExtendedBuilder<ContextIn, BasicExtensions<ContextIn>> {
  // type InferredExtensionsBlock = ExtensionsBlock<typeof extensions>
  const builder: Builder<ContextIn> = {
    step(title: string, action, reduce) {
      const stepBlock = {
        title,
        action,
        reduce
      };
      type ContextOut = ReturnType<typeof reduce>;
      return createWorkflow<ContextOut>(
        [...steps, stepBlock] as StepBlock<Action<any>, Context, Context>[],
        extensions,
      );
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

  return {
    ...builder,
    ...createExtensions<ContextIn>(builder)
  }

  // let extensionBlock = {};
  // for (const extension of extensions) {
  //   extensionBlock = {
  //     ...extensionBlock,
  //     ...extension(builderBase),
  //   }
  // }

  // const builder = {
  //   ...extensionBlock,
  //   ...builderBase,
  // } as Builder<ContextIn, InferredExtensionsBlock>;

  // return builderBase;
}

const workflow = createWorkflow();
workflow
  .log()
  .file()
  .step('first', () => 'first step action', (result, context) => ({ ...context, step1: result }))
  .step('second', () => 'second step action', (result, context) => ({ ...context, step2: result }))
  .step('third', () => 'third step action', (result, context) => ({ ...context, step3: result })).run();