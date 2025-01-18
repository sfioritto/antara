import { JsonObject } from "./types"
import type { SerializedError } from './types'
import { WORKFLOW_EVENTS, STATUS } from './constants'

export type EventTypes = typeof WORKFLOW_EVENTS[keyof typeof WORKFLOW_EVENTS];
export type StatusOptions = typeof STATUS[keyof typeof STATUS];

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
  completedStep?: Step,
  steps: Step[],
  options: Options,
}

export interface Step {
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
  initialCompletedSteps?: Step[];
}

export interface Builder<
  ContextIn extends JsonObject,
  InitialContext extends JsonObject,
  WorkflowOptions extends JsonObject,
> {
  (steps: StepBlock<JsonObject, any, JsonObject, WorkflowOptions>[]): {
    step: AddStep<ContextIn, InitialContext, WorkflowOptions>;
    run<Options extends WorkflowOptions>(
      params: RunParams<Options, InitialContext>
    ): AsyncGenerator<
      | Event<InitialContext, InitialContext, Options>  // START event
      | Event<ContextIn, ContextIn, Options>  // UPDATE events
      | Event<InitialContext, ContextIn, Options>  // COMPLETE event
      , void, unknown>;
  };
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
  ): ReturnType<Builder<Merge<ContextOut>, InitialContext, WorkflowOptions>>;

  <ActionOut>(
    title: string,
    action: Action<ContextIn, WorkflowOptions, ActionOut>
  ): ReturnType<
    Builder<Merge<GenericReducerOutput<ActionOut, ContextIn>>, InitialContext, WorkflowOptions>
  >;
  };


function outputSteps(
  currentContext: JsonObject,
  completedSteps: Step[],
  stepBlocks: StepBlock<JsonObject, any, JsonObject, JsonObject>[]
): Step[] {
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

// Add this type utility near your other type definitions
type Merge<T> = T extends object ? {
  [K in keyof T]: T[K]
} & {} : T;

// Add a type-safe clone helper
function cloneEvent<EventType extends Event<any, any, any>>(event: EventType): EventType {
  return structuredClone(event);
}

interface WorkflowConfig {
  name: string;
  description?: string;
}

export function createWorkflow<
  WorkflowOptions extends JsonObject = {},
  InitialContext extends JsonObject = {}
>(nameOrConfig: string | WorkflowConfig) {
  const workflowName = typeof nameOrConfig === 'string' ? nameOrConfig : nameOrConfig.name;
  const description = typeof nameOrConfig === 'string' ? undefined : nameOrConfig.description;

  // Actually define the function that adds steps
  function createBuilder<ContextIn extends JsonObject>(
    steps: StepBlock<JsonObject, WorkflowOptions, any, JsonObject>[]
  ) {
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

        const newSteps = [...steps, newStep] as typeof steps;
        return createBuilder<ContextOut>(newSteps);
      }) as AddStep<ContextIn, InitialContext, WorkflowOptions>,

      async *run<Options extends WorkflowOptions = WorkflowOptions>({
        initialContext = {} as InitialContext,
        initialCompletedSteps = [],
        options = {} as Options
      }: RunParams<Options, InitialContext> & {
        initialCompletedSteps?: Step[]
      }): AsyncGenerator<
        | Event<InitialContext, InitialContext, Options>  // START event
        | Event<ContextIn, ContextIn, Options>  // UPDATE events
        | Event<InitialContext, ContextIn, Options>  // COMPLETE event
        , void, unknown> {
        let newContext = initialCompletedSteps.length > 0
          ? structuredClone(initialCompletedSteps[initialCompletedSteps.length - 1].context)
          : structuredClone(initialContext);
        const completedSteps = [...initialCompletedSteps];

        const startEvent: Event<InitialContext, InitialContext, Options> = {
          workflowName,
          description,
          type: initialCompletedSteps.length > 0 ? WORKFLOW_EVENTS.RESTART : WORKFLOW_EVENTS.START,
          previousContext: initialContext,
          newContext: initialContext,
          status: STATUS.RUNNING,
          steps: outputSteps(newContext, completedSteps, steps),
          options,
        };

        yield cloneEvent(startEvent);

        // Skip already completed steps
        const remainingSteps = steps.slice(initialCompletedSteps.length);

        for (const step of remainingSteps) {
          const previousContext = structuredClone(newContext);

          try {
            const result = await step.action({ context: structuredClone(newContext), options });
            newContext = step.reduce
              ? await step.reduce({ result, context: structuredClone(newContext), options })
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
              steps: outputSteps(newContext, completedSteps, steps),
            };
            yield cloneEvent(errorEvent);
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
            steps: outputSteps(newContext, completedSteps, steps),
          };

          yield cloneEvent(updateEvent);
        }

        const completeEvent: Event<InitialContext, ContextIn, Options> = {
          workflowName,
          type: WORKFLOW_EVENTS.COMPLETE,
          previousContext: initialContext,
          newContext: newContext as ContextIn,
          status: STATUS.COMPLETE,
          options,
          steps: outputSteps(newContext, completedSteps, steps),
        };

        yield cloneEvent(completeEvent);
      },
    };

    return builder;
  }

  // 4. Return the "addSteps" result with a blank array to start
  return createBuilder<InitialContext>([]);
}

