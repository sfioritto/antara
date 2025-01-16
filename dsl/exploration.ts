type Merge<OldContext, NewProps> =
  Omit<OldContext, keyof NewProps> & NewProps;

type Simplify<T> = {
  [K in keyof T]: T[K];
} extends infer O ? O : never;

interface StepBlock<Ctx, Out extends object> {
  title: string;
  action: (context: Ctx) => Out | Promise<Out>;
  reduce?: (result: Out, context: Ctx) => Simplify<Merge<Ctx, Out>>;
}

function createWorkflow<TContext = {}>() {
  function addSteps<T>(steps: StepBlock<any, any>[]) {
    return {
      step<TOutput extends object>(
        title: string,
        action: (context: T) => TOutput | Promise<TOutput>,
        reduce?: (result: TOutput, context: T) => Simplify<Merge<T, TOutput>>
      ) {
        const newStep: StepBlock<T, TOutput> = {
          title,
          action,
          reduce
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


