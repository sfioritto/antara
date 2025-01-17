import { JsonObject } from "./types"
import type { SerializedError } from './types'
import { WORKFLOW_EVENTS, STATUS } from './constants'

export type EventTypes = typeof WORKFLOW_EVENTS[keyof typeof WORKFLOW_EVENTS];
export type StatusOptions = typeof STATUS[keyof typeof STATUS];

export interface Event<ContextIn, ContextOut, Options = any> {
  workflowName: string,
  previousContext: ContextIn,
  newContext: ContextOut,
  error?: SerializedError,
  type: EventTypes,
  status: StatusOptions,
  completedStep?: Step,
  steps: Step[],
  options?: Options,
}

export interface Step {
  title: string
  status: StatusOptions
  context: JsonObject
}

type ActionHandler<ContextIn, ActionOut> = (context: ContextIn) => ActionOut | Promise<ActionOut>
type ReduceHandler<ActionOut, ContextIn, ContextOut> = (result: ActionOut, context: ContextIn) => ContextOut | Promise<ContextOut>

interface StepBlock<ContextIn extends JsonObject, ActionOut, ContextOut extends JsonObject> {
  title: string;
  action: ActionHandler<ContextIn, ActionOut>,
  reduce: ReduceHandler<ActionOut, ContextIn, ContextOut>,
}

function outputSteps(
  currentContext: JsonObject,
  completedSteps: Step[],
  stepBlocks: StepBlock<JsonObject, any, JsonObject>[]
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

export function createWorkflow<InitialContext extends JsonObject = {}>(
  workflowName: string
) {
  function addSteps<ContextIn extends JsonObject>(
    steps: StepBlock<JsonObject, any, JsonObject>[]
  ) {
    return {
      step<ActionOut, ContextOut extends JsonObject>(
        title: string,
        action: ActionHandler<ContextIn, ActionOut>,
        reduce?: ReduceHandler<ActionOut, ContextIn, ContextOut>
      ) {

        const genericReducer: ReduceHandler<
          ActionOut, ContextIn, ContextOut
        > = (result: ActionOut, context: ContextIn): ContextOut => {
          if (result
            && typeof result === 'object'
            && !Array.isArray(result)
            && Object.getPrototypeOf(result) === Object.prototype
          ) {
            return {
              ...context,
              ...result,
            } as unknown as ContextOut;
          }
          return context as unknown as ContextOut;
        }

        const newStep = {
          title,
          action,
          reduce: reduce ? reduce : genericReducer,
        } as StepBlock<JsonObject, ActionOut, ContextOut>;
        const newSteps = [...steps, newStep];
        return addSteps<ContextOut>(newSteps);
      },

      async *run(
        initialContext?: InitialContext
      ): AsyncGenerator<Event<JsonObject, JsonObject>, void, unknown> {
        // This is going to be changed (potentially) after each step completes
        let newContext = initialContext || {};
        const completedSteps: Step[] = [];

        const startEvent = {
          workflowName,
          type: WORKFLOW_EVENTS.START,
          previousContext: newContext,
          newContext,
          status: STATUS.RUNNING,
          steps: outputSteps(newContext, completedSteps, steps),
        }

        yield structuredClone(startEvent)

        for (const step of steps) {
          const previousContext = newContext;

          try {
            const result = await step.action(newContext);
            newContext = step.reduce
              ? await step.reduce(result, newContext)
              : newContext;
          } catch (stepError) {
            const error = stepError as Error;
            console.error(error.message)

            const completedStep = {
              title: step.title,
              status: STATUS.ERROR,
              context: newContext,
            }
            completedSteps.push(completedStep);

            const errorEvent = {
              workflowName,
              type: WORKFLOW_EVENTS.ERROR,
              previousContext: newContext,
              newContext,
              status: STATUS.ERROR,
              error,
              completedStep,
              steps: outputSteps(newContext, completedSteps, steps),
            };
            yield structuredClone(errorEvent);
            return;
          }

          const completedStep = {
            title: step.title,
            status: STATUS.COMPLETE,
            context: newContext,
          };
          completedSteps.push(completedStep);

          const updateEvent = {
            workflowName,
            type: WORKFLOW_EVENTS.UPDATE,
            previousContext,
            newContext,
            completedStep,
            status: STATUS.RUNNING,
            steps: outputSteps(newContext, completedSteps, steps),
          }

          yield structuredClone(updateEvent);
        }

        const completeEvent = {
          workflowName,
          type: WORKFLOW_EVENTS.COMPLETE,
          previousContext: initialContext || {},
          newContext,
          status: STATUS.COMPLETE,
          steps: outputSteps(newContext, completedSteps, steps),
        };

        yield structuredClone(completeEvent);
      }
    };
  }

  return addSteps<InitialContext>([]);
}

// Example usage with reformatted function calls
const workflow = createWorkflow("test")
  .step(
    "Step 1",
    () => ({ count: 1 }),
    (result) => result
  )
  .step(
    "Step 2",
    (ctx) => ({ doubled: ctx.count * 2 }),
    (result, ctx) => ({ ...ctx, doubled: result.doubled })
  )
  .step(
    "Step 3",
    (ctx) => ({
      message: `${ctx.count} doubled is ${ctx.doubled}`
    })
);

const actionOnlyWorkflow = createWorkflow("actions only")
  .step("First step", () => ({ firstStep: "first" }))
  .step("Second step", (context) => ({ secondStep: context.firstStep }))

// TODO: figure out how to get types to flow through to each step event
// const workflowRun = workflow.run();
// const step1 = await workflow.next();
// console.log((step1.value as Event<any, any>).newContext.count)


