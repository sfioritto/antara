type Action<ActionResult> = () => ActionResult
type Reducer<ActionResult, ContextIn, ContextOut extends object> = (result: ActionResult, context: ContextIn) => ContextOut

interface Builder<ContextIn = {}> {
  step<ActionResult, ContextOut extends object>(
    title: string,
    action: Action<ActionResult>,
    reduce: Reducer<ActionResult, ContextIn, ContextOut>,
  ): Builder<ContextOut>,
  run(): void,
}

interface StepBlock<ActionResult, ContextIn, ContextOut extends object> {
  title: string,
  action: Action<ActionResult>,
  reduce: Reducer<ActionResult, ContextIn, ContextOut>,
}

function createBuilder<ContextIn>(
  steps: StepBlock<any, any, any>[] = []
): Builder<ContextIn> {

  return {
    step(title: string, action, reduce) {
      const stepBlock = {
        title,
        action,
        reduce
      };
      type ContextOut = ReturnType<typeof reduce>;
      return createBuilder<ContextOut>([...steps, stepBlock]);
    },
    run() {
      let context;
      for (const { title, action, reduce } of steps) {
        const result = action();
        context = reduce(result, context);
        console.log(JSON.stringify(context, null, 2));
      }
    }
  }
}

function createWorkflow() {
  return createBuilder();
}

const workflow = createWorkflow();

workflow
  .step('first', () => 'first step action', (result) => ({ step1: result }))
  .step('step', () => 'second step action', (result, context) => ({ ...context, step2: result })).run();