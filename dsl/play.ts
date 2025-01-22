import { JsonObject } from "./types";

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
  ): ExtendedBuilder<ContextOut, FileExtensionReturn<ContextOut> & LoggerExtensionReturn<ContextOut>>,
  run(): void,
}

type ExtendedBuilder<
  ContextIn extends Context,
  TExtensionsBlock,
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

type FileExtensionReturn<ContextIn extends Context> = ReturnType<typeof fileExtension<ContextIn>>;
type LoggerExtensionReturn<ContextIn extends Context> = ReturnType<typeof loggerExtension<ContextIn>>;

function fileExtension<ContextIn extends Context> (
  builder: Builder<ContextIn>
) {
  return {
    file: {
      write() {
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
      }
    },
  };
}

function loggerExtension<ContextIn extends Context>(
  builder: Builder<ContextIn>
) {
  return {
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

type Extension = <ContextIn extends Context>(builder: Builder<ContextIn>) => any

function createExtensions<ContextIn extends Context>(
  builder: Builder<ContextIn>,
  extensions: Extension[],
): FileExtensionReturn<ContextIn> & LoggerExtensionReturn<ContextIn> {
  return extensions.reduce((acc, extension) => ({
    ...acc,
    ...extension<ContextIn>(builder)
  }), {} as any);
}

function createWorkflow<
  ContextIn extends Context,
>(
  options: {
    steps?: StepBlock<Action<any>, Context, Context>[];
    extensions?: Extension[];
  } = {}
): ExtendedBuilder<ContextIn, FileExtensionReturn<ContextIn> & LoggerExtensionReturn<ContextIn>> {
  const { steps = [], extensions = [] } = options;

  const builder: Builder<ContextIn> = {
    step(title: string, action, reduce) {
      const stepBlock = {
        title,
        action,
        reduce
      };
      type ContextOut = ReturnType<typeof reduce>;
      return createWorkflow<ContextOut>({
        steps: [...steps, stepBlock] as StepBlock<Action<any>, Context, Context>[],
        extensions
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

  return {
    ...builder,
    ...createExtensions(builder, extensions)
  }
}

const workflow = createWorkflow({ extensions: [fileExtension, loggerExtension] });
workflow
  .log()
  .file.write()
  .step('first', () => 'first step action', (result, context) => ({ ...context, step1: result + context.logger }))
  .step('second', () => 'second step action', (result, context) => ({ ...context, step2: result + context.step1 }))
  .step('third', () => 'third step action', (result, context) => ({ ...context, step3: result + context.step2 }))
  .run();