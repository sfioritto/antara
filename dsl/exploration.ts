type Merge<OldContext, NewProps> =
  Omit<OldContext, keyof NewProps> & NewProps;

interface StepBlock<Ctx, Out extends object> {
  title: string;
  fn: (context: Ctx) => Out | Promise<Out>;
}

// This type “expands” whatever T is, so you don’t see gnarly Merge<...> in the hints.
type Simplify<T> = {
  [K in keyof T]: T[K];
} extends infer O ? O : never;


function createWorkflow<ContextShape = {}>(
  existingSteps: StepBlock<any, any>[] = []
) {
  return {
    step<Output extends object>(
      title: string,
      fn: (ctx: ContextShape) => Output | Promise<Output>
    ) {
      const newSteps = [...existingSteps, { title, fn }];

      // Flatten out the nested merges
      type NewContext = Simplify<Merge<ContextShape, Output>>;

      return createWorkflow<NewContext>(newSteps);
    },

    build(name: string) {
      return {
        name,
        async run(initialContext: Partial<ContextShape> = {}) {
          let context = initialContext as ContextShape;
          for (const { title, fn } of existingSteps) {
            const result = await fn(context);
            context = { ...context, ...result };
          }
          return context;
        },
      };
    },
  };
}
