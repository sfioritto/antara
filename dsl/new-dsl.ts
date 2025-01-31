import { JsonObject, SerializedError } from "./types";
import { WORKFLOW_EVENTS, STATUS } from './constants';

function clone<T>(original: T): T {
  return structuredClone(original) as T;
}

type Context = JsonObject;

interface WorkflowConfig {
  name: string;
  description?: string;
}

export interface Event<
  ContextIn extends Context, ContextOut extends Context,
  Options extends object = {}
> {
  workflowName: string;
  description?: string;
  type: typeof WORKFLOW_EVENTS[keyof typeof WORKFLOW_EVENTS];
  status: typeof STATUS[keyof typeof STATUS];
  previousContext: ContextIn;
  newContext: ContextOut;
  error?: SerializedError;
  completedStep?: SerializedStep;
  steps: SerializedStep[];
  options: Options;
}

interface SerializedStep {
  title: string;
  status: typeof STATUS[keyof typeof STATUS];
  context: Context;
}

type Action<
  TContextIn extends Context,
  TOptions extends object = {},
  TContextOut extends Context = TContextIn & Context
> = (params: { context: TContextIn; options: TOptions }) => TContextOut | Promise<TContextOut>;

type Flatten<T> = T extends object
  ? T extends Promise<infer R>
    ? Flatten<R>
    : { [K in keyof T]: T[K] }
  : T;

export type ExtensionMethod<TContextIn extends Context, TOptions extends object = {}> =
  (...args: any[]) => Action<TContextIn, TOptions, TContextIn>;

export type ExtensionMethodOrObject<TContextIn extends Context, TOptions extends object = {}> =
  | ExtensionMethod<TContextIn, TOptions>
  | { title?: string; handler: ExtensionMethod<TContextIn, TOptions> };

type Extension<
  TContextIn extends Context,
  TOptions extends object = {}
> = {
  [name: string]: ExtensionMethodOrObject<TContextIn, TOptions> | {
    [name: string]: ExtensionMethodOrObject<TContextIn, TOptions>
  }
};

type StepBlock<
  ContextIn extends Context,
  Options extends object = {}
> = {
  title: string;
  action: Action<ContextIn, Options>;
};

type MergeExtensions<
  T extends Extension<any>[]
> = T extends [infer First extends Extension<any>, ...infer Rest extends Extension<any>[]]
  ? Rest extends []
    ? First
    : First & MergeExtensions<Rest>
  : never;

function createExtensionStep<
  ContextIn extends Context,
  Options extends object
>(
  key: string,
  extensionMethod: ExtensionMethodOrObject<ContextIn, Options>,
  args: any[]
) {
  let action: Action<ContextIn, Options>;
  let titleSuffix = key;
  if (typeof extensionMethod === 'function') {
    action = extensionMethod(...args);
  } else {
    // extensionMethod is wrapped with an optional title and a handler
    action = extensionMethod.handler(...args);
    if (extensionMethod.title) {
      titleSuffix = extensionMethod.title;
    }
  }
  return {
    title: titleSuffix,
    action
  };
}

type ExtensionResult<EM> = EM extends (...args: any[]) => (...args: any[]) => infer R
  ? Awaited<R>
  : never;

type BuilderExtension<
  TContextIn extends Context,
  TOptions extends object,
  TExtension extends Extension<Context>
> = {
  [K in keyof TExtension]: TExtension[K] extends ExtensionMethodOrObject<any, any>
    ? (
        ...args: TExtension[K] extends { handler: infer H }
          ? H extends (...args: any[]) => any
            ? Parameters<H>
            : never
          : TExtension[K] extends (...args: any[]) => any
            ? Parameters<TExtension[K]>
            : never
      ) => Builder<
        TContextIn & ExtensionResult<
          TExtension[K] extends { handler: infer H }
            ? H extends (...args: any[]) => any
              ? H
              : never
            : TExtension[K] extends (...args: any[]) => any
              ? TExtension[K]
              : never
        >,
        TOptions,
        TExtension
      >
    : {
        [P in keyof TExtension[K]]: TExtension[K][P] extends ExtensionMethodOrObject<any, any>
          ? (
              ...args: TExtension[K][P] extends { handler: infer H }
                ? H extends (...args: any[]) => any
                  ? Parameters<H>
                  : never
                : TExtension[K][P] extends (...args: any[]) => any
                  ? Parameters<TExtension[K][P]>
                  : never
            ) => Builder<
              TContextIn & ExtensionResult<
                TExtension[K][P] extends { handler: infer H }
                  ? H extends (...args: any[]) => any
                    ? H
                    : never
                  : TExtension[K][P] extends (...args: any[]) => any
                    ? TExtension[K][P]
                    : never
              >,
              TOptions,
              TExtension
            >
          : never
      }
};

interface RunParams<
  Options extends object = {},
  ContextIn extends Context = Context
> {
  initialContext?: ContextIn;
  options?: Options;
  initialCompletedSteps?: SerializedStep[];
}

export type Builder<
  TContextIn extends Context,
  TOptions extends object,
  TExtension extends Extension<Context>
> = {
  step: <TContextOut extends Context>(
    title: string,
    action: (params: { context: Flatten<TContextIn>; options: TOptions }) => TContextOut | Promise<TContextOut>
  ) => Builder<
    Flatten<TContextOut>,
    TOptions,
    TExtension
  >;
  run(params?: RunParams<TOptions, TContextIn>): AsyncGenerator<Event<any, any, TOptions>, void, unknown>;
} & BuilderExtension<Flatten<TContextIn>, TOptions, TExtension>;

export const createWorkflow = <
  TOptions extends object = {},
  TExtensions extends Extension<Context>[] = [Extension<Context>]
>(
  nameOrConfig: string | WorkflowConfig,
  extensions: TExtensions | [] = []
) => {
  const workflowName = typeof nameOrConfig === 'string' ? nameOrConfig : nameOrConfig.name;
  const description = typeof nameOrConfig === 'string' ? undefined : nameOrConfig.description;
  const extensionBlock = Object.assign({}, ...extensions) as MergeExtensions<TExtensions>;
  const combinedExtension = createExtension(extensionBlock);
  return createBuilder<Context, TOptions, typeof combinedExtension>(combinedExtension, [], { workflowName, description });
}

function createBuilder<
  ContextIn extends Context,
  Options extends object,
  TExtension extends Extension<Context>
>(
  extension: TExtension,
  steps: StepBlock<any, Options>[] = [],
  metadata: { workflowName: string; description?: string }
): Builder<ContextIn, Options, TExtension> {
  const builder = {
    step: (<TContextOut extends Context>(
      title: string,
      action: (params: { context: Flatten<ContextIn>; options: Options }) => TContextOut | Promise<TContextOut>
    ) => {
      const newStep = { title, action };
      return createBuilder<TContextOut, Options, TExtension>(
        extension,
        [...steps, newStep],
        metadata
      );
    }),
    ...Object.fromEntries(
      Object.entries(extension).map(([key, extProp]) => {
        // helper type-guard for when an extension method is an object with a handler property
        const isExtensionObject = (m: any): m is { handler: Function } => m && typeof m === 'object' && 'handler' in m;
        if (typeof extProp === 'function' || isExtensionObject(extProp)) {
          return [key, (...args: any[]) => {
            const newStep = createExtensionStep(key, extProp, args);
            return createBuilder<ContextIn, Options, TExtension>(
              extension,
              [...steps, newStep],
              metadata
            );
          }];
        } else {
          // Nested extension case
          return [key, Object.fromEntries(Object.entries(extProp as object).map(([subKey, subMethod]) => {
            return [
              subKey,
              (...args: any[]) => {
                const newStep = createExtensionStep(
                  `${key}.${subKey}`,
                  subMethod,
                  args
                );
                return createBuilder<ContextIn, Options, TExtension>(
                  extension,
                  [...steps, newStep],
                  metadata
                );
              }
            ];
          }))]
        }
      })
    ),
    run: async function* ({ initialContext = {} as ContextIn, options = {} as Options, initialCompletedSteps = [] } = {}) {
      let currentContext = clone(initialContext) as Context;
      const completedSteps: SerializedStep[] = [...initialCompletedSteps];

      // If we have completed steps, use the context from the last completed step
      if (initialCompletedSteps.length > 0) {
        currentContext = clone(initialCompletedSteps[initialCompletedSteps.length - 1].context);
      }

      // Emit start/restart event
      yield clone({
        workflowName: metadata.workflowName,
        description: metadata.description,
        type: initialCompletedSteps.length > 0 ? WORKFLOW_EVENTS.RESTART : WORKFLOW_EVENTS.START,
        status: STATUS.RUNNING,
        previousContext: initialContext,
        newContext: currentContext,
        steps: steps.map((step, index) =>
          completedSteps[index] || {
            title: step.title,
            status: STATUS.PENDING,
            context: currentContext
          }
        ),
        options
      });

      // Skip already completed steps and execute remaining ones
      const remainingSteps = steps.slice(initialCompletedSteps.length);

      // Execute remaining steps
      for (const step of remainingSteps) {
        const previousContext = clone(currentContext);

        try {
          const result = await step.action({ context: clone(currentContext), options });
          currentContext = clone(result);

          const completedStep = {
            title: step.title,
            status: STATUS.COMPLETE,
            context: currentContext
          };
          completedSteps.push(completedStep);

          // Emit update event
          yield clone({
            workflowName: metadata.workflowName,
            description: metadata.description,
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
            ),
            options
          });

        } catch (error) {
          console.error((error as Error).message);

          const errorStep = {
            title: step.title,
            status: STATUS.ERROR,
            context: currentContext
          };
          completedSteps.push(errorStep);

          // Emit error event with enhanced error context
          yield clone({
            workflowName: metadata.workflowName,
            description: metadata.description,
            type: WORKFLOW_EVENTS.ERROR,
            status: STATUS.ERROR,
            previousContext,
            newContext: currentContext,
            error: error as SerializedError,
            completedStep: errorStep,
            steps: steps.map((s, index) =>
              completedSteps[index] || {
                title: s.title,
                status: STATUS.PENDING,
                context: currentContext
              }
            ),
            options
          });
          return;
        }
      }

      // Emit complete event
      yield clone({
        workflowName: metadata.workflowName,
        description: metadata.description,
        type: WORKFLOW_EVENTS.COMPLETE,
        status: STATUS.COMPLETE,
        previousContext: initialContext,
        newContext: currentContext,
        steps: completedSteps,
        options
      });
    }
  } as Builder<ContextIn, Options, TExtension>;

  return builder;
}

export const createExtension = <
  TExtension extends Extension<Context>
>(ext: TExtension): TExtension => ext;

