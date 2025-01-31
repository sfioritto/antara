import { JsonObject, SerializedError } from "./types";
import { WORKFLOW_EVENTS, STATUS } from './constants';

type Context = JsonObject;

interface WorkflowConfig {
  name: string;
  description?: string;
}

export interface Event<ContextIn extends Context, ContextOut extends Context, Options extends JsonObject = {}> {
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

type Action<TContextIn extends Context, TOptions extends JsonObject = {}, TContextOut extends Context = TContextIn & Context> =
  (params: { context: TContextIn; options: TOptions }) => TContextOut | Promise<TContextOut>;

type Flatten<T> = T extends object
  ? T extends Promise<infer R>
    ? Flatten<R>
    : { [K in keyof T]: T[K] }
  : T;

type ExtensionMethod<
  TContextIn extends Context,
  TOptions extends JsonObject = {},
  TArgs extends any[] = any[],
  TContextOut extends Context = TContextIn
> = (...args: TArgs) => Action<TContextIn, TOptions, TContextOut extends Promise<infer R> ? R : TContextOut>;

type Extension<TContextIn extends Context, TOptions extends JsonObject = {}> = {
  [name: string]: ExtensionMethod<TContextIn, TOptions> | {
    [name: string]: ExtensionMethod<TContextIn, TOptions>
  }
};

type StepBlock<ContextIn extends Context, Options extends JsonObject = {}> = {
  title: string;
  action: Action<ContextIn, Options, ContextIn extends Promise<infer R> ? R : ContextIn>;
};

type MergeExtensions<T extends Extension<any>[]> = T extends [infer First extends Extension<any>, ...infer Rest extends Extension<any>[]]
  ? Rest extends []
    ? First
    : First & MergeExtensions<Rest>
  : never;

function createExtensionStep<ContextIn extends Context, Options extends JsonObject>(
  key: string,
  extensionMethod: ExtensionMethod<ContextIn, Options>,
  args: any[]
): StepBlock<ContextIn, Options> {
  const action = extensionMethod(...args);
  return {
    title: `Extension: ${key}`,
    action
  };
}

type BuilderExtension<
  TContextIn extends Context,
  TOptions extends JsonObject,
  TExtension extends Extension<any>
> = {
  [K in keyof TExtension]: TExtension[K] extends ExtensionMethod<any>
    ? (
        ...args: Parameters<TExtension[K]>
      ) => Builder<
        TContextIn & Awaited<ReturnType<ReturnType<TExtension[K]>>>,
        TOptions,
        TExtension
      >
    : {
        [P in keyof TExtension[K]]: TExtension[K][P] extends ExtensionMethod<any>
          ? (
              ...args: Parameters<TExtension[K][P]>
            ) => Builder<
              TContextIn & Awaited<ReturnType<ReturnType<TExtension[K][P]>>>,
              TOptions,
              TExtension
            >
          : never
      }
};

type Builder<
  TContextIn extends Context,
  TOptions extends JsonObject,
  TExtension extends Extension<Context>
> = {
  step: <TContextOut extends Context>(
    title: string,
    action: (params: { context: TContextIn; options: TOptions }) => TContextOut | Promise<TContextOut>
  ) => Builder<
    Flatten<TContextOut>,
    TOptions,
    TExtension
  >;
  run(params?: { initialContext?: TContextIn, options?: TOptions }): AsyncGenerator<Event<any, any, TOptions>, void, unknown>;
} & BuilderExtension<TContextIn, TOptions, TExtension>;

export const createWorkflow = <
  TContextIn extends Context,
  TOptions extends JsonObject = {},
  TExtensions extends Extension<TContextIn>[]= []
>(
  nameOrConfig: string | WorkflowConfig,
  extensions: [...TExtensions]
) => {
  const workflowName = typeof nameOrConfig === 'string' ? nameOrConfig : nameOrConfig.name;
  const description = typeof nameOrConfig === 'string' ? undefined : nameOrConfig.description;
  const extensionBlock = Object.assign({}, ...extensions) as MergeExtensions<TExtensions>;
  const combinedExtension = createExtension(extensionBlock);
  return createBuilder<TContextIn, TOptions, typeof combinedExtension>(combinedExtension, [], { workflowName, description });
}

function createBuilder<
  ContextIn extends Context,
  Options extends JsonObject,
  TExtension extends Extension<Context>
>(
  extension: TExtension,
  steps: StepBlock<any, Options>[] = [],
  metadata: { workflowName: string; description?: string }
): Builder<ContextIn, Options, TExtension> {
  const builder = {
    step: (<TContextOut extends Context>(
      title: string,
      action: (params: { context: ContextIn; options: Options }) => TContextOut | Promise<TContextOut>
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
    run: async function* ({ initialContext = {} as ContextIn, options = {} as Options } = {}) {
      let currentContext = structuredClone(initialContext) as Context;
      const completedSteps: SerializedStep[] = [];
      console.log('run')
      // Emit start event
      yield {
        workflowName: metadata.workflowName,
        description: metadata.description,
        type: WORKFLOW_EVENTS.START,
        status: STATUS.RUNNING,
        previousContext: initialContext,
        newContext: currentContext,
        steps: steps.map(step => ({
          title: step.title,
          status: STATUS.PENDING,
          context: currentContext
        })),
        options
      };

      // Execute steps
      for (const step of steps) {
        const previousContext = structuredClone(currentContext);

        try {
          const result = await step.action({ context: currentContext, options });
          currentContext = result;

          const completedStep = {
            title: step.title,
            status: STATUS.COMPLETE,
            context: currentContext
          };
          completedSteps.push(completedStep);

          // Emit update event
          yield {
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
            workflowName: metadata.workflowName,
            description: metadata.description,
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
            ),
            options
          };
          return;
        }
      }

      // Emit complete event
      yield {
        workflowName: metadata.workflowName,
        description: metadata.description,
        type: WORKFLOW_EVENTS.COMPLETE,
        status: STATUS.COMPLETE,
        previousContext: initialContext,
        newContext: currentContext,
        steps: completedSteps,
        options
      };
    }
  } as Builder<ContextIn, Options, TExtension>;

  return builder;
}

export const createExtension = <TExtension extends Extension<Context>>(ext: TExtension): TExtension => ext;

