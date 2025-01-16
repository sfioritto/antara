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

interface StepBlock<Ctx extends JsonObject, Out extends JsonObject> {
  title: string;
  action: ((context: Ctx) => Out | Promise<Out>);
  reduce?: (result: Out, context: Ctx) => Simplify<Merge<Ctx, Out>>;
}

// I think this can work. What you are thinking here is you have to pass in action that returns a serializable output. But you want actions to be able to return non-serializable output. Also, you want to have a function signature with step where if it's a function, but not an action block, then it just assumes that that's a function that can return a serializable object and then it just assumes you're going to do a simple reducer, so you don't have to do that yourself. So I think in order to do that, I think you need to have the step accept action blocks instead of functions. I think the action blocks then have handlers with the T and the T output, et cetera. That way all the types work. I think it can work. I think if you can do that, then you can have type imprints and it'll actually, and the builder syntax is not really all that bad. It's actually basically the same. But you'll still have action functions and you'll still have reducer functions. It'll look really, really similar.

export function createWorkflow<TContext extends JsonObject = {}>() {
  function addSteps<T extends JsonObject>(steps: StepBlock<any, any>[]) {
    return {
      step<TOutput extends JsonObject>(
        title: string,
        action: (context: T) => TOutput | Promise<TOutput>,
        reduce?: (result: TOutput, context: T) => Simplify<Merge<T, TOutput>>
      ) {
        const newStep: StepBlock<T, TOutput> = {
          title,
          action,
          reduce,
        };
        const newSteps = [...steps, newStep];
        type NewContext = Simplify<Merge<T, TOutput>>;
        return addSteps<NewContext>(newSteps);
      },
      build(name: string) {
        return {
          name,
          steps,
          async run(initialContext: Partial<T> = {}) {
            let context = initialContext as T;
            for (const step of steps) {
              const result = await step.action(context);
              context = step.reduce
                ? step.reduce(result, context)
                : { ...context, ...result };
            }
            return context;
          }
        };
      }
    };
  }

  return addSteps<TContext>([]);
}

const workflow = createWorkflow()
  .step(
    "Step 1",
    () => ({ count: 1 })
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


