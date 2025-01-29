import { JsonObject } from "./types";

type Context = JsonObject;

type Chainable<
  TContextIn extends Context,
  TExtension extends Extension<any>
> = {
  step: AddStep<TContextIn, TExtension>;
} & {
  [K in keyof TExtension]: TExtension[K] extends
    (...args: infer A) => (context: TContextIn) => (infer TContextOut extends Context)
    ? (...args: A) => Chainable<TContextOut, TransformExtension<TExtension, TContextOut>>
    : TExtension[K];
};

type AddStep<TContextIn extends Context, TExtension extends Extension<any>> = {
  <TContextOut extends Context>(
    title: string,
    action: (context: TContextIn) => TContextOut
  ): Chainable<TContextOut, TransformExtension<TExtension, TContextOut>>;
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
  TContextIn extends Context
> = {
  [K in keyof TExtension]: (
    ...args: Parameters<TExtension[K]>
  ) => (context: TContextIn) => TContextIn;
};

function transformExtension<
  TExtension extends Extension<any>,
  TContextIn extends Context
>(
  extension: TExtension
): TransformExtension<TExtension, TContextIn> {
  return Object.fromEntries(
    Object.entries(extension).map(([k, fn]) => [
      k,
      (...args: any[]) => (context: TContextIn) => ({ ...context, ...fn(...args)(context) })
    ])
  ) as TransformExtension<TExtension, TContextIn>;
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
      Object.entries(extension).map(([key, extensionMethod]) => [
        key,
        (...args: any[]) => {
          const action = extensionMethod(...args);
          const newContext = action(context);
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

const createExtension = <TExtension extends Extension<Context>>(ext: TExtension): TExtension => ext;

const simpleExtension = createExtension({
  simple: (message: string) => {
    return (context) => ({ message: `${message}: cool${context?.cool || '? ...not cool yet'}` });
  }
});

const myBase = createBase(simpleExtension, {})
  .simple('message')
  .step('Add coolness', context => ({ cool: 'ness', ...context }))
  .step('Identity', context => ({ bad: 'news', ...context }))
  .step('final step', context => context)
  .simple('maybe not')
  .step('final final step v3', context => context)

type AssertEquals<T, U> = [T] extends [U] ? [U] extends [T] ? true : false : false;

// Expected final context type
type ExpectedFinalContext = {
  message: string;
  cool: string;
  bad: string;
};

// Type test
type TestFinalContext = typeof myBase extends { step: (...args: any[]) => any } ?
  Parameters<Parameters<typeof myBase['step']>[1]>[0] : never;

// This will show a type error if the types don't match
type TestResult = AssertEquals<TestFinalContext, ExpectedFinalContext>;

// If you want to be even more explicit, you can add a const assertion
const _typeTest: TestResult = true;
