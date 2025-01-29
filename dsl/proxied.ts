import { JsonObject } from "./types";

type Context = JsonObject;

type Chainable<TContextIn extends Context, TExtension extends Extension<any>> = {
  step: AddStep<TContextIn, TExtension>;
} & {
  [K in keyof TExtension]: TExtension[K] extends
    (...args: infer A) => (context: TContextIn) => infer TContextOut
    ? (...args: A) => Chainable<TContextOut & Context, TransformExtension<TExtension, TContextOut & Context>>
    : TExtension[K];
};

type AddStep<TContextIn extends Context, TExtension extends Extension<any>> = {
  <TContextOut extends Context>(
    title: string,
    action: (context: TContextIn) => TContextOut
  ): Chainable<TContextOut & Context, TransformExtension<TExtension, TContextOut & Context>>;
}

type Extension<TContextIn extends Context> = {
  [name: string]: (...args: any[]) => (context: TContextIn) => TContextIn & Context
};

type StepBlock<ContextIn extends Context> = {
  title: string;
  action: (context: ContextIn) => Context | Promise<Context>;
}

type TransformExtension<
  TExtension extends Extension<any>,
  TNewContext extends Context
> = {
  [K in keyof TExtension]: (
    ...args: Parameters<TExtension[K]>
  ) => (context: TNewContext) => TNewContext & Context;
};

function transformExtension<T extends Extension<any>, TNew extends Context>(
  extension: T
): TransformExtension<T, TNew> {
  return Object.fromEntries(
    Object.entries(extension).map(([k, fn]) => [
      k,
      (...args: any[]) => (context: TNew) => ({ ...context, ...fn(...args)(context as any) })
    ])
  ) as TransformExtension<T, TNew>;
}

const createBase = <
  ContextIn extends Context,
  TExtension extends Extension<ContextIn>,
>(
  extension: TExtension,
  context: ContextIn,
  steps: StepBlock<any>[] = []
): Chainable<ContextIn, TExtension> => {
  const base = {
    step: (<TContextOut extends Context>(
      title: string,
      action: (context: ContextIn) => TContextOut
    ) => {
      const newStep = { title, action };
      const newContext = action(context);
      console.log(newContext);
      return createBase<TContextOut, TransformExtension<TExtension, TContextOut>>(
        transformExtension<TExtension, TContextOut>(extension),
        newContext,
        [...steps, newStep]
      );
    }) as AddStep<ContextIn, TExtension>,
    ...Object.fromEntries(
      Object.entries(extension).map(([key, fn]) => [
        key,
        (...args: any[]) => {
          const contextTransformer = fn(...args);
          const newContext = contextTransformer(context);
          return createBase<typeof newContext, TransformExtension<TExtension, typeof newContext>>(
            transformExtension<TExtension, typeof newContext>(extension),
            newContext,
            steps
          );
        }
      ])
    )
  } as Chainable<ContextIn, TExtension>;

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
