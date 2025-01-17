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

type ActionHandlerParams<ContextIn extends JsonObject, WorkflowOptions extends JsonObject> = {
  context: ContextIn;
  options: WorkflowOptions;
}

type ReduceHandlerParams<
  ActionOut,
  ContextIn extends JsonObject,
  WorkflowOptions extends JsonObject
> = {
  result: ActionOut;
  context: ContextIn;
  options: WorkflowOptions;
}

type ActionHandler<
  ContextIn extends JsonObject,
  WorkflowOptions extends JsonObject,
  ActionOut
> = (params: ActionHandlerParams<ContextIn, WorkflowOptions>) => ActionOut | Promise<ActionOut>

type ReduceHandler<
  ActionOut,
  ContextIn extends JsonObject,
  WorkflowOptions extends JsonObject,
  ContextOut extends JsonObject
> = (params: ReduceHandlerParams<ActionOut, ContextIn, WorkflowOptions>) => ContextOut | Promise<ContextOut>

interface StepBlock<
  ContextIn extends JsonObject,
  WorkflowOptions extends JsonObject,
  ActionOut,
  ContextOut extends JsonObject
> {
  title: string;
  action: (params: ActionHandlerParams<ContextIn, WorkflowOptions>) => ActionOut | Promise<ActionOut>;
  reduce: (params: ReduceHandlerParams<ActionOut, ContextIn, WorkflowOptions>) => ContextOut | Promise<ContextOut>;
}

type GenericReducerOutput<ActionOut, ContextIn> =
  ActionOut extends JsonObject ? Merge<ContextIn & ActionOut> : ContextIn;

interface RunParams<WorkflowOptions extends JsonObject, InitialContext extends JsonObject> {
  initialContext?: InitialContext;
  options?: WorkflowOptions;
}

export interface AddSteps<
  ContextIn extends JsonObject,
  InitialContext extends JsonObject,
  WorkflowOptions extends JsonObject,
> {
  (steps: StepBlock<JsonObject, any, JsonObject, WorkflowOptions>[]): {
    step: StepFunction<ContextIn, InitialContext, WorkflowOptions>;
    run<Options extends WorkflowOptions>(
      params: RunParams<Options, InitialContext>
    ): AsyncGenerator<
      | Event<InitialContext, InitialContext, Options>  // START event
      | Event<ContextIn, ContextIn, Options>  // UPDATE events
      | Event<InitialContext, ContextIn, Options>  // COMPLETE event
      , void, unknown>;
  };
}

export type StepFunction<
  ContextIn extends JsonObject,
  InitialContext extends JsonObject,
  WorkflowOptions extends JsonObject,
> = {
  <ActionOut, ContextOut extends JsonObject>(
    title: string,
    action: ActionHandler<ContextIn, WorkflowOptions, ActionOut>,
    reduce: ReduceHandler<ActionOut, ContextIn, WorkflowOptions, ContextOut>
  ): ReturnType<AddSteps<Merge<ContextOut>, InitialContext, WorkflowOptions>>;

  <ActionOut>(
    title: string,
    action: ActionHandler<ContextIn, WorkflowOptions, ActionOut>
  ): ReturnType<
    AddSteps<Merge<GenericReducerOutput<ActionOut, ContextIn>>, InitialContext, WorkflowOptions>
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

export function createWorkflow<
  WorkflowOptions extends JsonObject = {},
  InitialContext extends JsonObject = {}
>(workflowName: string) {
  // Actually define the function that adds steps
  function addSteps<ContextIn extends JsonObject>(
    steps: StepBlock<JsonObject, WorkflowOptions, any, JsonObject>[]
  ) {
    return {
      step: (<ActionOut, ContextOut extends JsonObject>(
        title: string,
        action: ActionHandler<ContextIn, WorkflowOptions, ActionOut>,
        reduce?: ReduceHandler<ActionOut, ContextIn, WorkflowOptions, ContextOut>
      ) => {
        const genericReducer: ReduceHandler<
          ActionOut,
          ContextIn,
          WorkflowOptions,
          Merge<ActionOut & ContextIn>
        > = ({ result, context }) => {
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
        return addSteps<ContextOut>(newSteps);
      }) as StepFunction<ContextIn, InitialContext, WorkflowOptions>,

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
          ? initialCompletedSteps[initialCompletedSteps.length - 1].context
          : initialContext;
        const completedSteps = [...initialCompletedSteps];

        const startEvent: Event<InitialContext, InitialContext, Options> = {
          workflowName,
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
          const previousContext = newContext;

          try {
            const result = await step.action({ context: newContext, options });
            newContext = step.reduce
              ? await step.reduce({ result, context: newContext, options })
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
  }

  // 4. Return the "addSteps" result with a blank array to start
  return addSteps<InitialContext>([]);
}

// Example usage with reformatted function calls
const options = {
  features: ['speed', 'maneuver'],
}
const workflow = createWorkflow<typeof options>("test")
  .step(
    "Step 1",
    () => ({ count: 1 }),
    ({ result }) => result
  )
  .step(
    "Step 2",
    ({ context, options }) => ({ doubled: context.count * 2 }),
    ({ result, context, options }) => ({
      ...context,
      doubled: result.doubled,
      featureOne: options.features[0],
    })
  )
  .step(
    "Step 3",
    ({ context, options }) => ({
      message: `${context.count} doubled is ${context.doubled}`,
      featureTwo: options.features[1],
    }))
  .step(
    "Step 4",
    ({ context }) => console.log(context),
);

const workflowRun = workflow.run({
  options,
})

const stepOne = await workflowRun.next()
console.log(stepOne.value?.options)

const workflowRunTwo = workflow.run({
  options: {
    ...options,
    workflowRunId: 4,
  }
})

const stepAgain = await workflowRunTwo.next()
console.log(stepAgain.value?.options)
console.log(stepAgain.value?.previousContext)

const actionOnlyWorkflow = createWorkflow("actions only")
  .step("First step", () => ({ firstStep: "first" }))
  .step("Second step", ({ context }) => ({ secondStep: context.firstStep }))

// TODO: figure out how to get types to flow through to each step event
// const workflowRun = workflow.run();
// const step1 = await workflow.next();
// console.log((step1.value as Event<any, any>).newContext.count)

