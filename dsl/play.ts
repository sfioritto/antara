import { JsonObject, Step } from "./types";
type Context = JsonObject;
type Action<ActionResult> = () => ActionResult;
type Reducer<
  ActionResult,
  ContextIn extends Context,
  ContextOut extends Context> = (result: ActionResult, context: ContextIn) => ContextOut;

interface Builder<ContextIn extends Context> {
  step<ActionResult, ContextOut extends object>(
    title: string,
    action: Action<ActionResult>,
    reduce: Reducer<ActionResult, ContextIn, ContextOut>,
  ): Builder<ContextOut>,
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

type Extension<
  TExtensionsBlock extends ExtensionsBlock<any>
  > = (builder: Builder<Context>) => TExtensionsBlock & {
    [KEY: string]: (...args: any) => Builder<Context>
  };

type ExtensionsBlock<
  Extensions extends Extension<any>[]
> =
  Extensions[number] extends (...args: any) => infer ReturnType ? ReturnType : never;

function createBuilder<
  TExtensionsBlock extends ExtensionsBlock<Extension<unknown>[]>,
  ContextIn extends Context,
  >(steps: StepBlock<Action<any>, Context, Context>[] = [],
  extensions: Extension<unknown>[] = [],
): Builder<ContextIn> {
  return {
    step(title: string, action, reduce) {
      const stepBlock = {
        title,
        action,
        reduce
      };
      type ContextOut = ReturnType<typeof reduce>;
      return createBuilder<TExtensionsBlock, ContextOut>(
        [...steps, stepBlock] as StepBlock<Action<any>, Context, Context>[],
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
  }
}

function createWorkflow<ContextIn extends Context>(
  steps: StepBlock<Action<any>, Context, Context>[] = [],
  extensions: Extension<unknown>[] = [],
): Builder<ContextIn> {
  type TExtensionsBlock = ExtensionsBlock<typeof extensions>
  return createBuilder<TExtensionsBlock, ContextIn>(steps, extensions);
}

const workflow = createWorkflow();

workflow
  .step('first', () => 'first step action', (result) => ({ step1: result }))
  .step('second', () => 'second step action', (result, context) => ({ ...context, step2: result }))
  .step('third', () => 'third step action', (result, context) => ({ ...context, step3: result })).run();