import { JsonObject } from "./types"

interface StepBlock<ContextIn extends JsonObject, ActionOut, ContextOut> {
  title: string;
  action: ((context: ContextIn) => ActionOut | Promise<ActionOut>);
  reduce?: (result: ActionOut, context: ContextIn) => ContextOut
}

export function createWorkflow<InitialContext extends JsonObject = {}>(name: string) {
  function addSteps<ContextIn extends JsonObject>(steps: StepBlock<any, any, any>[]): {
    step: <ActionOut, ContextOut extends JsonObject>(
      title: string,
      action: (context: ContextIn) => ActionOut | Promise<ActionOut>,
      reduce?: (result: ActionOut, context: ContextIn) => ContextOut
    ) => ReturnType<typeof addSteps<ContextOut>>,
    run: (initialContext: InitialContext) => Promise<any>
  } {
    return {
      step<ActionOut, ContextOut extends JsonObject>(
        title: string,
        action: (context: ContextIn) => ActionOut | Promise<ActionOut>,
        reduce?: (result: ActionOut, context: ContextIn) => ContextOut
      ) {
        const newStep: StepBlock<ContextIn, ActionOut, ContextOut> = {
          title,
          action,
          reduce,
        };
        const newSteps = [...steps, newStep];
        return addSteps<ContextOut>(newSteps);
      },
      async run(initialContext: InitialContext) {
        let context = initialContext;
        for (const step of steps) {
          const result = await step.action(context);
          context = step.reduce
            ? step.reduce(result, context)
            : initialContext;
        }
        return context;
      }
    };
  }

  return addSteps<InitialContext>([]);
}

// Example usage would now look like:
const workflow = createWorkflow("test")
  .step(
    "Step 1",
    () => ({ count: 1 }),
    (result) => result,
  )
  .step(
    "Step 2",
    (ctx) => ({ doubled: ctx.count * 2 }),
    (result, ctx) => ({ ...ctx, doubled: result.doubled })
  )
  .step(
    "Step 3",
    (ctx) => ({
      message: `${ctx.count} doubled is ${ctx.doubled}`
    })
  )
  .run({ /* initial context */ });


