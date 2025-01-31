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

type ExtensionMethod<
  TContextIn extends Context,
  TOptions extends object = {},
  TArgs extends any[] = any[],
  TContextOut extends Context = TContextIn
> = (...args: TArgs) => Action<TContextIn, TOptions, TContextOut extends Promise<infer R> ? R : TContextOut>;

type Extension<
  TContextIn extends Context,
  TOptions extends object = {}
> = {
  [name: string]: ExtensionMethod<TContextIn, TOptions> | {
    [name: string]: ExtensionMethod<TContextIn, TOptions>
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
  extensionMethod: ExtensionMethod<ContextIn, Options>,
  args: any[]
) {
  const action = extensionMethod(...args);
  return {
    title: `Extension: ${key}`,
    action
  };
}

type BuilderExtension<
  TContextIn extends Context,
  TOptions extends object,
  TExtension extends Extension<any>
> = {
  [K in keyof TExtension]: TExtension[K] extends ExtensionMethod<any>
    ? (...args: Parameters<TExtension[K]>) => Builder<
        TContextIn & Awaited<ReturnType<ReturnType<TExtension[K]>>>,
        TOptions,
        TExtension
      >
    : {
        [P in keyof TExtension[K]]: TExtension[K][P] extends ExtensionMethod<any>
          ? (...args: Parameters<TExtension[K][P]>) => Builder<
              TContextIn & Awaited<ReturnType<ReturnType<TExtension[K][P]>>>,
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
      Object.entries(extension).map(([key, extensionMethod]) => [
        key,
        typeof extensionMethod === 'function'
          ? (...args: any[]) => {
              const newStep = createExtensionStep(key, extensionMethod, args);
              return createBuilder<ContextIn, Options, TExtension>(
                extension,
                [...steps, newStep],
                metadata
              );
            }
          : Object.fromEntries(
              Object.entries(extensionMethod as object).map(([subKey, subMethod]) => [
                subKey,
                (...args: any[]) => {
                  const newStep = createExtensionStep(
                    `${key}.${subKey}`,
                    subMethod as ExtensionMethod<ContextIn>,
                    args
                  );
                  return createBuilder<ContextIn, Options, TExtension>(
                    extension,
                    [...steps, newStep],
                    metadata
                  );
                }
              ])
            )
      ])
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

