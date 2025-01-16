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
  completedStep?: Step<ContextOut>,
  steps: Step<JsonObject>[],
  options?: Options,
}

export interface Step<Context> {
  title: string
  status: StatusOptions
  context: Context
}

interface StepBlock<ContextIn extends JsonObject, ActionOut, ContextOut> {
  title: string;
  action: ((context: ContextIn) => ActionOut | Promise<ActionOut>);
  reduce?: (result: ActionOut, context: ContextIn) => ContextOut | Promise<ContextOut>
}

function outputSteps<Context extends JsonObject>(
  currentContext: Context,
  completedSteps: Step<JsonObject>[],
  stepBlocks: StepBlock<any, any, any>[],
): Step<JsonObject>[] {
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

export function createWorkflow<InitialContext extends JsonObject = {}>(workflowName: string) {
  function addSteps<ContextIn extends JsonObject>(steps: StepBlock<any, any, any>[]): {
    step: <ActionOut, ContextOut extends JsonObject>(
      title: string,
      action: (context: ContextIn) => ActionOut | Promise<ActionOut>,
      reduce?: (result: ActionOut, context: ContextIn) => ContextOut
    ) => ReturnType<typeof addSteps<ContextOut>>,
    run: (initialContext?: InitialContext) => AsyncGenerator<any, void, unknown>
  } {
    return {
      step<ActionOut, ContextOut extends JsonObject>(
        title: string,
        action: (context: ContextIn) => ActionOut | Promise<ActionOut>,
        reduce?: (result: ActionOut, context: ContextIn) => ContextOut | Promise<ContextOut>
      ) {
        const newStep: StepBlock<ContextIn, ActionOut, ContextOut> = {
          title,
          action,
          reduce,
        };
        const newSteps = [...steps, newStep];
        return addSteps<ContextOut>(newSteps);
      },
      async *run(initialContext?: InitialContext): AsyncGenerator<Event<JsonObject, JsonObject>, void, unknown> {
        // This is going to be changed (potentially) after each step completes
        let newContext = initialContext || {} as InitialContext;
        const completedSteps: Step<JsonObject>[] = [];

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

// Example usage
const workflow = createWorkflow("test")
  .step(
    "Step 1",
    () => ({ count: 1 }),
    (result) => result,
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
  )
  .run();


