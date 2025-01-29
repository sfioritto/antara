import { JsonObject } from "./types";
import { WORKFLOW_EVENTS, STATUS } from './constants';
import type { SerializedError } from './types';

type Context = JsonObject;

type Chainable<
  TContextIn extends Context,
  TExtension extends Extension<any>
> = {
  step: AddStep<TContextIn, TExtension>;
  run(initialContext?: TContextIn): AsyncGenerator<Event<any, any>, void, unknown>;
} & {
  [K in keyof TExtension]: TExtension[K] extends
    (...args: infer A) => (context: TContextIn) => (Promise<infer TContextOut extends Context> | infer TContextOut extends Context)
    ? (...args: A) => Chainable<TContextOut, TransformExtension<TExtension, TContextOut>>
    : TExtension[K];
};

type AddStep<TContextIn extends Context, TExtension extends Extension<any>> = {
  <TContextOut extends Context>(
    title: string,
    action: (context: TContextIn) => TContextOut | Promise<TContextOut>
  ): Chainable<TContextOut, TransformExtension<TExtension, TContextOut>>;
}

type Extension<TContextIn extends Context> = {
  [name: string]: (...args: any[]) => (context: TContextIn) => (Promise<TContextIn & Context> | (TContextIn & Context))
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
      (...args: any[]) => (context: TContextIn) => ({ ...context, ...(fn(...args)(context)) })
    ])
  ) as TransformExtension<TExtension, TContextIn>;
}

const createBuilder = <
  ContextIn extends Context,
  TExtension extends Extension<ContextIn>,
>(
  extension: TExtension,
  steps: StepBlock<any>[] = []
): Chainable<ContextIn, TExtension> => {
  const builder = {
    step: (<TContextOut extends Context>(
      title: string,
      action: (context: ContextIn) => TContextOut
    ) => {
      const newStep = { title, action };
      return createBuilder<TContextOut, TransformExtension<TExtension, TContextOut>>(
        transformExtension<TExtension, TContextOut>(extension),
        [...steps, newStep]
      );
    }) as AddStep<ContextIn, TExtension>,
    ...Object.fromEntries(
      Object.entries(extension).map(([key, extensionMethod]) => [
        key,
        (...args: any[]) => {
          const action = extensionMethod(...args);
          const newStep = {
            title: `Extension: ${key}`,
            action: (ctx: ContextIn) => action(ctx)
          };
          return createBuilder<ContextIn, TExtension>(
            extension,
            [...steps, newStep]
          );
        }
      ])
    ),
    run: async function* (initialContext: ContextIn = {} as ContextIn) {
      let currentContext = structuredClone(initialContext) as Context;
      const completedSteps: SerializedStep[] = [];

      // Emit start event
      yield {
        type: WORKFLOW_EVENTS.START,
        status: STATUS.RUNNING,
        previousContext: initialContext,
        newContext: currentContext,
        steps: steps.map(step => ({
          title: step.title,
          status: STATUS.PENDING,
          context: currentContext
        }))
      };

      // Execute steps
      for (const step of steps) {
        const previousContext = structuredClone(currentContext);

        try {
          currentContext = await step.action(currentContext);

          const completedStep = {
            title: step.title,
            status: STATUS.COMPLETE,
            context: currentContext
          };
          completedSteps.push(completedStep);

          // Emit update event
          yield {
            type: WORKFLOW_EVENTS.UPDATE,
            status: STATUS.RUNNING,
            previousContext,
            newContext: currentContext,
            completedStep,
            steps: steps.map((s, index) =>
              completedSteps[index] || {
                title: s.title,
                status: STATUS.PENDING,
                context: currentContext
              }
            )
          };

        } catch (error) {
          const errorStep = {
            title: step.title,
            status: STATUS.ERROR,
            context: currentContext
          };
          completedSteps.push(errorStep);

          // Emit error event
          yield {
            type: WORKFLOW_EVENTS.ERROR,
            status: STATUS.ERROR,
            previousContext,
            newContext: currentContext,
            error: error as Error,
            completedStep: errorStep,
            steps: steps.map((s, index) =>
              completedSteps[index] || {
                title: s.title,
                status: STATUS.PENDING,
                context: currentContext
              }
            )
          };
          return;
        }
      }

      // Emit complete event
      yield {
        type: WORKFLOW_EVENTS.COMPLETE,
        status: STATUS.COMPLETE,
        previousContext: initialContext,
        newContext: currentContext,
        steps: completedSteps
      };
    }
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
  extensions: [...TExtensions]
) => {
  const extensionBlock = Object.assign({}, ...extensions) as MergeExtensions<TExtensions>;
  const combinedExtension = createExtension(extensionBlock);
  return createBuilder(combinedExtension, []);
}

const createExtension = <TExtension extends Extension<Context>>(ext: TExtension): TExtension => ext;

const simpleExtension = createExtension({
  simple: (message: string) => {
    return (context) => ({ message: `${message}: cool${context?.cool || '? ...not cool yet'}` });
  }
});

const anotherExtension = createExtension({
  another: () => async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    })
    return { another: 'another extension' };
  }
})

const myBuilder = createWorkflow([simpleExtension, anotherExtension])
  .simple('message')
  .another()
  .step('Add coolness', async context => {
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    })
    return {
      cool: 'ness', ...context
    }
  })
  .step('Identity', context => ({ bad: 'news', ...context }))
  .step('final step', context => context)
  .simple('maybe not')
  .step('final final step v3', context => context)

type AssertEquals<T, U> =
  0 extends (1 & T) ? false : // fails if T is any
  0 extends (1 & U) ? false : // fails if U is any
  [T] extends [U] ? [U] extends [T] ? true : false : false;

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

export interface Event<ContextIn extends Context, ContextOut extends Context> {
  type: typeof WORKFLOW_EVENTS[keyof typeof WORKFLOW_EVENTS];
  status: typeof STATUS[keyof typeof STATUS];
  previousContext: ContextIn;
  newContext: ContextOut;
  error?: SerializedError;
  completedStep?: SerializedStep;
  steps: SerializedStep[];
}

interface SerializedStep {
  title: string;
  status: typeof STATUS[keyof typeof STATUS];
  context: Context;
}
