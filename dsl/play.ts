import { FileExtension } from "../extensions/files";
import { JsonObject } from "./types";

type Context = JsonObject;

type Action<ActionResult> = () => ActionResult;

type Reducer<
  ActionResult,
  ContextIn extends Context,
  ContextOut extends Context> = (result: ActionResult, context: ContextIn) => ContextOut;

type Builder<
  ContextIn extends Context,
  TExtensionsBlock extends ExtensionsBlock,
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
  TExtensionsBlock extends ExtensionsBlock,
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

type ExtensionCreator = <
  ContextIn extends Context,
  TExtensionsBlock extends ExtensionsBlock,
>(builder: Builder<ContextIn, TExtensionsBlock>) => {
  [key: string]: (...args: any[]) => ExtendedBuilder<Context, ExtensionsBlock>
};

const createExtension = <T extends ExtensionCreator>(fn: T): T => fn;

type ExtensionsBlock = {
  [KEY: string]: (...args: any[]) => ExtendedBuilder<Context, ExtensionsBlock>
};

type Extension = <TExtensionsBlock extends ExtensionsBlock>(builder: Builder<Context, TExtensionsBlock>) => ExtensionsBlock;

type InferExtensionsBlock<T extends Extension[]> = T extends Array<infer E>
  ? E extends Extension
    ? ReturnType<E> extends ExtensionsBlock
      ? ReturnType<E> & ExtensionsBlock
      : never
    : never
  : never;

const fileExtension = createExtension(builder => ({
  file: () => builder.step(
    "file step",
    () => console.log("file action"),
    (result, context) => ({ ...context, file: "file content" })
  )
}));

const loggerExtension = createExtension(builder => ({
  log: () => builder.step(
    "Log step",
    () => console.log("logging action"),
    (result, context) => ({ ...context, logger: "log step" })
  )
}));

function createBuilder<
  ContextIn extends Context,
  TExtensionsBlock extends ExtensionsBlock,
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
}) {
  return createBuilder<ContextIn, InferExtensionsBlock<TExtensions>>({
    steps,
    extensions
  });
}

const workflow = createWorkflow({ extensions: [fileExtension, loggerExtension] });
const logger = workflow.log();
type Logger = typeof logger;
workflow
  .log()
  .file()
  .step('first', () => 'first step action', (result, context) => ({ ...context, step1: result + context.logger }))
  .step('second', () => 'second step action', (result, context) => ({ ...context, step2: result + context.step1 }))
  .step('third', () => 'third step action', (result, context) => ({ ...context, step3: result + context.step2 })).run();

