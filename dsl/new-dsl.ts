import { JsonObject } from "./types"
import type { SerializedError } from './types'
import { WORKFLOW_EVENTS, STATUS } from './constants'

export type EventTypes = typeof WORKFLOW_EVENTS[keyof typeof WORKFLOW_EVENTS];
export type StatusOptions = typeof STATUS[keyof typeof STATUS];

export interface Builder<
  ContextIn extends JsonObject,
  InitialContext extends JsonObject,
  WorkflowOptions extends JsonObject
> {
  step: AddStep<ContextIn, InitialContext, WorkflowOptions>;
  run<Options extends WorkflowOptions>(
    params: RunParams<Options, InitialContext>
  ): AsyncGenerator<
    | Event<InitialContext, InitialContext, Options>  // START event
    | Event<ContextIn, JsonObject, Options>  // UPDATE events
    | Event<InitialContext, ContextIn, Options>  // COMPLETE event
    , void, unknown>;
}

export interface Event<
  ContextIn extends JsonObject,
  ContextOut extends JsonObject,
  Options extends JsonObject,
> {
  workflowName: string,
  description?: string,
  previousContext: ContextIn,
  newContext: ContextOut,
  error?: SerializedError,
  type: EventTypes,
  status: StatusOptions,
  completedStep?: SerializedStep,
  steps: SerializedStep[],
  options: Options,
}

export interface SerializedStep {
  title: string
  status: StatusOptions
  context: JsonObject
}

type Action<
  ContextIn extends JsonObject,
  WorkflowOptions extends JsonObject,
  ActionOut
> = (params: {
  context: ContextIn;
  options: WorkflowOptions;
}) => ActionOut | Promise<ActionOut>

type Reduce<
  ActionOut,
  ContextIn extends JsonObject,
  WorkflowOptions extends JsonObject,
  ContextOut extends JsonObject
> = (params: {
  result: ActionOut;
  context: ContextIn;
  options: WorkflowOptions;
}) => ContextOut | Promise<ContextOut>

interface StepBlock<
  ContextIn extends JsonObject,
  WorkflowOptions extends JsonObject,
  ActionOut,
  ContextOut extends JsonObject
> {
  title: string;
  action: Action<ContextIn, WorkflowOptions, ActionOut>;
  reduce: Reduce<ActionOut, ContextIn, WorkflowOptions, ContextOut>;
}

type GenericReducerOutput<ActionOut, ContextIn> =
  ActionOut extends JsonObject ? Merge<ContextIn & ActionOut> :
  ActionOut extends void ? ContextIn :
  ContextIn;

interface RunParams<WorkflowOptions extends JsonObject, InitialContext extends JsonObject> {
  initialContext?: InitialContext;
  options?: WorkflowOptions;
  initialCompletedSteps?: SerializedStep[];
}

export type AddStep<
  ContextIn extends JsonObject,
  InitialContext extends JsonObject,
  WorkflowOptions extends JsonObject,
> = {
  <ActionOut, ContextOut extends JsonObject>(
    title: string,
    action: Action<ContextIn, WorkflowOptions, ActionOut>,
    reduce: Reduce<ActionOut, ContextIn, WorkflowOptions, ContextOut>
  ): Builder<Merge<ContextOut>, InitialContext, WorkflowOptions>;

  <ActionOut>(
    title: string,
    action: Action<ContextIn, WorkflowOptions, ActionOut>
  ): Builder<Merge<GenericReducerOutput<ActionOut, ContextIn>>, InitialContext, WorkflowOptions>;
};

type Merge<T> = T extends object ? {
  [K in keyof T]: T[K]
} & {} : T;

interface WorkflowConfig {
  name: string;
  description?: string;
}

function clone<T>(original: T): T {
  return structuredClone(original) as T;
}

function serializedSteps(
  currentContext: JsonObject,
  completedSteps: SerializedStep[],
  stepBlocks: StepBlock<JsonObject, any, JsonObject, JsonObject>[]
): SerializedStep[] {
  return stepBlocks.map((stepBlock, index) => {
    const completedStep = completedSteps[index];
    if (!completedStep) {
      return {
        title: stepBlock.title,
        status: STATUS.PENDING,
        context: currentContext,
      };
    }
    return completedStep;
  });
}

export function createWorkflow<
  WorkflowOptions extends JsonObject = {},
  InitialContext extends JsonObject = {}
>(nameOrConfig: string | WorkflowConfig) {
  const workflowName = typeof nameOrConfig === 'string' ? nameOrConfig : nameOrConfig.name;
  const description = typeof nameOrConfig === 'string' ? undefined : nameOrConfig.description;

  function createBuilder<
    ContextIn extends JsonObject
  >(
    steps: StepBlock<JsonObject, WorkflowOptions, any, JsonObject>[]
  ): Builder<ContextIn, InitialContext, WorkflowOptions> {
    const builder = {
      step: (<ActionOut, ContextOut extends JsonObject>(
        title: string,
        action: Action<ContextIn, WorkflowOptions, ActionOut>,
        reduce?: Reduce<ActionOut, ContextIn, WorkflowOptions, ContextOut>
      ) => {
        const genericReducer: Reduce<
          ActionOut,
          ContextIn,
          WorkflowOptions,
          Merge<ActionOut & ContextIn>
        > = ({ result, context }) => {
          if (result === undefined || result === null) {
            return context as Merge<ActionOut & ContextIn>;
          }
          if (
            result &&
            typeof result === "object" &&
            !Array.isArray(result) &&
            Object.getPrototypeOf(result) === Object.prototype
          ) {
            return {
              ...context,
              ...result,
            } as Merge<ActionOut & ContextIn>;
          }
          return context as Merge<ActionOut & ContextIn>;
        };

        const newStep = {
          title,
          action,
          reduce: reduce ?? genericReducer,
        } as StepBlock<JsonObject, WorkflowOptions, ActionOut, ContextOut>;

        const newSteps = [...steps, newStep];
        return createBuilder<ContextOut>(newSteps);
      }) as AddStep<ContextIn, InitialContext, WorkflowOptions>,

      run: async function* <Options extends WorkflowOptions>({
        initialContext = {} as InitialContext,
        initialCompletedSteps = [],
        options = {} as Options
      }: RunParams<Options, InitialContext>): AsyncGenerator<
        | Event<InitialContext, InitialContext, Options> // START event
        | Event<ContextIn, ContextIn, Options> // Update Event
        | Event<InitialContext, ContextIn, Options> // Complete Event
        , void, unknown> {
        let newContext = initialCompletedSteps.length > 0
          ? clone(initialCompletedSteps[initialCompletedSteps.length - 1].context)
          : clone(initialContext);
        const completedSteps = [...initialCompletedSteps];

        const startEvent: Event<InitialContext, InitialContext, Options> = {
          workflowName,
          description,
          type: initialCompletedSteps.length > 0 ? WORKFLOW_EVENTS.RESTART : WORKFLOW_EVENTS.START,
          previousContext: initialContext,
          newContext: initialContext,
          status: STATUS.RUNNING,
          steps: serializedSteps(newContext, completedSteps, steps),
          options,
        };

        yield clone(startEvent);

        // Skip already completed steps
        const remainingSteps = steps.slice(initialCompletedSteps.length);

        for (const step of remainingSteps) {
          const previousContext = clone(newContext);

          try {
            const result = await step.action({ context: clone(newContext), options });
            newContext = step.reduce
              ? await step.reduce({ result, context: clone(newContext), options })
              : newContext;
          } catch (stepError) {
            const error = stepError as Error;
            console.error(error.message);

            const completedStep = {
              title: step.title,
              status: STATUS.ERROR,
              context: newContext,
            };
            completedSteps.push(completedStep);

            const errorEvent: Event<ContextIn, ContextIn, Options> = {
              workflowName,
              type: WORKFLOW_EVENTS.ERROR,
              previousContext: previousContext as ContextIn,
              newContext: newContext as ContextIn,
              status: STATUS.ERROR,
              error,
              completedStep,
              options,
              steps: serializedSteps(newContext, completedSteps, steps),
            };
            yield clone(errorEvent);
            return;
          }

          const completedStep = {
            title: step.title,
            status: STATUS.COMPLETE,
            context: newContext,
          };
          completedSteps.push(completedStep);

          const updateEvent: Event<ContextIn, ContextIn, Options> = {
            workflowName,
            type: WORKFLOW_EVENTS.UPDATE,
            previousContext: previousContext as ContextIn,
            newContext: newContext as ContextIn,
            completedStep,
            status: STATUS.RUNNING,
            options,
            steps: serializedSteps(newContext, completedSteps, steps),
          };

          yield clone(updateEvent);
        }

        const completeEvent: Event<InitialContext, ContextIn, Options> = {
          workflowName,
          type: WORKFLOW_EVENTS.COMPLETE,
          previousContext: initialContext,
          newContext: newContext as ContextIn,
          status: STATUS.COMPLETE,
          options,
          steps: serializedSteps(newContext, completedSteps, steps),
        };

        yield clone(completeEvent);
      }
    };

    return builder;
  }

  return createBuilder<InitialContext>([]);
}

// Higher-order function to add file capabilities
export function withFiles<
  ContextIn extends JsonObject,
  InitialContext extends JsonObject,
  WorkflowOptions extends JsonObject,
>(
  builder: Builder<ContextIn, InitialContext, WorkflowOptions>
): Builder<ContextIn, InitialContext, WorkflowOptions> & {
  file: (name: string, path: string) => Builder<
    Merge<ContextIn & { files: Record<string, string> }>,
    InitialContext,
    WorkflowOptions
  >
} {
  return {
    ...builder,
    file: (name: string, path: string) => {
      return builder.step(
        `Reading file: ${name}`,
        async ({ context }) => {
          const files = (context as any).files || {};
          if (name in files) {
            throw new Error(
              `File name "${name}" already exists in this workflow run. Names must be unique within a workflow.`
            );
          }
          return {
            files: {
              [name]: "File content will go here."
            }
          };
        }
      );
    }
  };
}

