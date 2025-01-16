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
  steps?: Step<JsonObject>[],
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
  reduce?: (result: ActionOut, context: ContextIn) => ContextOut
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
        reduce?: (result: ActionOut, context: ContextIn) => ContextOut
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

        const startEvent = {
          workflowName,
          type: WORKFLOW_EVENTS.START,
          previousContext: newContext,
          newContext,
          status: STATUS.RUNNING,
        }

        yield structuredClone(startEvent)

        for (const step of steps) {
          const previousContext = newContext;

          try {
            const result = await step.action(newContext);
            newContext = step.reduce
              ? step.reduce(result, newContext)
              : initialContext;
          } catch (stepError) {
            const error = stepError as Error;
            console.error(error.message)

            const errorEvent = {
              workflowName,
              type: WORKFLOW_EVENTS.ERROR,
              previousContext: newContext,
              newContext,
              status: STATUS.ERROR,
              error,
            };
            yield structuredClone(errorEvent);
            return;
          }

          const completedStep = {
            title: step.title,
            status: STATUS.COMPLETE,
            context: newContext,
          };

          const updateEvent = {
            workflowName,
            type: WORKFLOW_EVENTS.UPDATE,
            previousContext,
            newContext,
            completedStep,
            status: STATUS.RUNNING,
          }

          yield structuredClone(updateEvent);
        }

        const completeEvent = {
          workflowName,
          type: WORKFLOW_EVENTS.COMPLETE,
          previousContext: initialContext || {},
          newContext,
          status: STATUS.COMPLETE
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


