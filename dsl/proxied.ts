import { JsonObject } from "./types";

type Context = JsonObject;

type Chainable<TBase, TContext extends Context> = {
  step: AddStep<TContext, TBase>;
} & {
  [K in keyof TBase]: TBase[K] extends (...args: any[]) => any
    ? (...args: Parameters<TBase[K]>) => Chainable<
        TBase,
        TBase[K] extends (...args: any[]) => (context: Context) => (infer R extends Context)
          ? R
          : ReturnType<TBase[K]>
      >
    : TBase[K];
};

type AddStep<TContext extends Context, TBase> = {
  <TContextOut extends Context>(
    title: string,
    action: (context: TContext) => TContextOut
  ): Chainable<TBase, TContextOut>;
}

type Extension = { [name: string]: (...args: any[]) => (context: Context) => Context };

type StepBlock<ContextIn extends Context> = {
  title: string;
  action: (context: ContextIn) => Context | Promise<Context>;
}

const createBase = <
  ContextIn extends Context,
  TExtension extends Extension,
>(
  extension: TExtension,
  context: ContextIn,
  steps: StepBlock<any>[] = []
): Chainable<TExtension, ContextIn> => {
  const base = {
    step: (<TContextOut extends Context>(
      title: string,
      action: (context: ContextIn) => TContextOut
    ) => {
      const newStep = { title, action };
      const newContext = action(context);
      console.log(newContext);
      return createBase<TContextOut, TExtension>(extension, newContext, [...steps, newStep]);
    }) as AddStep<ContextIn, TExtension>,
    ...Object.fromEntries(
      Object.entries(extension).map(([key, fn]) => [
        key,
        (...args: any[]) => {
          const contextTransformer = fn(...args);
          const newContext = contextTransformer(context);
          return createBase(extension, newContext, steps);
        }
      ])
    )
  } as Chainable<TExtension, ContextIn>;

  return base;
}

const simpleExtension = {
  simple: (message: string) => {
    return (context: Context) => ({ ...context, message });
  }
}

const myBase = createBase(simpleExtension, {})
  .simple('message')
  .step('Add coolness', context => ({ cool: 'ness', ...context }))
  .step('Identity', context => ({ bad: 'news', ...context }))
  .step('final step', context => context)
  .simple('maybe not')
  .step('final final step v3', context => context)
