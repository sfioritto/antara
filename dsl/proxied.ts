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

type Flatten<T> = T extends object ? {
  [K in keyof T]: T[K]
} : T;

type TransformExtension<
  TExtension extends Extension<any>,
  TContextIn extends Context
> = {
  [K in keyof TExtension]: (
    ...args: Parameters<TExtension[K]>
  ) => (context: TContextIn) => Flatten<TContextIn & ReturnType<ReturnType<TExtension[K]>>>;
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

const createBuilder = <
  ContextIn extends Context,
  TExtension extends Extension<ContextIn>,
>(
  extension: TExtension,
  context: ContextIn,
  steps: StepBlock<any>[] = []
): Chainable<ContextIn, TExtension> => {
  const builder = {
    step: (<TContextOut extends Context>(
      title: string,
      action: (context: ContextIn) => TContextOut
    ) => {
      const newStep = { title, action };
      const newContext = action(context);
      console.log(newContext);
      return createBuilder<TContextOut, TransformExtension<TExtension, TContextOut>>(
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
          return createBuilder<typeof newContext, TransformExtension<TExtension, typeof newContext>>(
            transformExtension<TExtension, typeof newContext>(extension),
            newContext,
            steps
          );
        }
      ])
    )
  } as Chainable<ContextIn, TExtension>;

  return builder;
}

type MergeExtensions<T extends Extension<any>[]> = T extends [infer First extends Extension<any>, ...infer Rest extends Extension<any>[]]
  ? Rest extends []
    ? First
    : First & MergeExtensions<Rest>
  : never;


const createWorkflow = <
  TContextIn extends Context,
  TExtensions extends Extension<TContextIn>[]
>(
  context: TContextIn = {} as TContextIn,
  extensions: [...TExtensions]
) => {
  const extensionBlock = Object.assign({}, ...extensions) as MergeExtensions<TExtensions>;
  const combinedExtension = createExtension(extensionBlock);
  return createBuilder(combinedExtension, context);
}

const createExtension = <TExtension extends Extension<Context>>(ext: TExtension): TExtension => ext;

const simpleExtension = createExtension({
  simple: (message: string) => {
    return (context) => ({ message: `${message}: cool${context?.cool || '? ...not cool yet'}` });
  }
});

const anotherExtension = createExtension({
  another: () => () => ({ another: 'another extension' }),
})

const myBuilder = createWorkflow({}, [simpleExtension, anotherExtension])
  .simple('message')
  .another()
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
  another: string
};

// Type test
type TestFinalContext = typeof myBuilder extends { step: (...args: any[]) => any } ?
  Parameters<Parameters<typeof myBuilder['step']>[1]>[0] : never;

// This will show a type error if the types don't match
type TestResult = AssertEquals<TestFinalContext, ExpectedFinalContext>;

// If you want to be even more explicit, you can add a const assertion
const _typeTest: TestResult = true;
