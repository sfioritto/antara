import { JsonObject } from "./types"

// Ensure Merge always returns a JsonObject
type Merge<OldContext extends JsonObject, NewProps extends JsonObject> =
  Omit<OldContext, keyof NewProps> & NewProps extends infer R
  ? R extends JsonObject
    ? R
    : never
  : never;

// Ensure Simplify preserves the JsonObject constraint
type Simplify<T extends JsonObject> = {
  [K in keyof T]: T[K];
} extends infer O
  ? O extends JsonObject
    ? O
    : never
  : never;

interface StepBlock<ContextIn extends JsonObject, ActionOut, ContextOut> {
  title: string;
  action: ((context: ContextIn) => ActionOut | Promise<ActionOut>);
  reduce?: (result: ActionOut, context: ContextIn) => ContextOut
}

export function createWorkflow<InitialContext extends JsonObject = {}>() {
  function addSteps<ContextIn extends JsonObject>(steps: StepBlock<any, any, any>[]) {
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
      build(name: string) {
        return {
          name,
          steps,
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
    };
  }

  return addSteps<InitialContext>([]);
}

const workflow = createWorkflow()
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
  .build("test");


