import { JsonObject, Step } from "./types";
type Context = JsonObject;
type Action<ActionResult> = () => ActionResult;
type Reducer<
  ActionResult,
  ContextIn extends Context,
  ContextOut extends Context> = (result: ActionResult, context: ContextIn) => ContextOut;

type Builder<ContextIn extends Context> = {
  step<ActionResult, ContextOut extends object>(
    title: string,
    action: Action<ActionResult>,
    reduce: Reducer<ActionResult, ContextIn, ContextOut>,
  ): Builder<ContextOut>,
  run(): void,
}

type ExtendedBuilder<
  ContextIn extends Context,
  TExtensionsBlock extends ExtensionsBlock<Extension[]>,
> = TExtensionsBlock & {
  step<ActionResult, ContextOut extends object>(
    title: string,
    action: Action<ActionResult>,
    reduce: Reducer<ActionResult, ContextIn, ContextOut>,
  ): ExtendedBuilder<ContextOut, TExtensionsBlock>,
  run(): void,
}

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
  file: <TBuilder extends ExtendedBuilder<ContextIn, any>>(builder: TBuilder) => TBuilder
}

function createWorkflow<
  ContextIn extends Context,
>(
  steps: StepBlock<Action<any>, Context, Context>[] = [],
  extensions: Extension[] = [],
): ExtendedBuilder<ContextIn, BasicExtensions<ContextIn>> {
  // type InferredExtensionsBlock = ExtensionsBlock<typeof extensions>
  return {
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
      ) as ExtendedBuilder<ContextOut, BasicExtensions<ContextIn>>;
    },
    run() {
      let context = {};
      for (const { title, action, reduce } of steps) {
        const result = action();
        context = reduce(result, context);
        console.log(JSON.stringify(context, null, 2));
      }
    },
    file(builder: ExtendedBuilder<Context, any>) {
      return builder.step(
        "file step", () => console.log("file action"),
        (result: any, context: Context) => {
          return {
            ...context,
            file: "file content",
          }
        }
      )
    }
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
  .file(workflow)
  .step('first', () => 'first step action', (result) => ({ step1: result }))
  .file(workflow)
  .step('second', () => 'second step action', (result, context) => ({ ...context, step2: result }))
  .step('third', () => 'third step action', (result, context) => ({ ...context, step3: result })).run();