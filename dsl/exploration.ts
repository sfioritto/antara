import { JsonObject } from "./types"
import type { Event, Step, StatusOptions, SerializedError } from './types'
import { WORKFLOW_EVENTS, STEP_EVENTS, STATUS } from './constants'


interface StepBlock<ContextIn extends JsonObject, ActionOut, ContextOut> {
  title: string;
  action: ((context: ContextIn) => ActionOut | Promise<ActionOut>);
  reduce?: (result: ActionOut, context: ContextIn) => ContextOut
}

export function createWorkflow<InitialContext extends JsonObject = {}>(name: string) {
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
      async *run(initialContext?: InitialContext): AsyncGenerator<any, void, unknown> {
        let context = initialContext || {} as InitialContext;

        try {
          for (const step of steps) {
            const stepData: Step<InitialContext> = {
              title: step.title,
              status: STATUS.RUNNING,
              context
            };

            const result = await step.action(context);
            context = step.reduce
              ? step.reduce(result, context)
              : initialContext;

            stepData.status = STATUS.COMPLETE;
            stepData.context = context;

            yield {
              type: STEP_EVENTS.COMPLETE,
              status: STATUS.COMPLETE,
              completedStep: stepData,
              previousContext: context,
              newContext: context
            };
          }

          yield {
            type: WORKFLOW_EVENTS.COMPLETE,
            status: STATUS.COMPLETE,
            previousContext: context,
            newContext: context
          };
        } catch (error) {
          const serializedError: SerializedError = {
            message: (error as Error).message,
            name: (error as Error).name,
            stack: (error as Error).stack
          };

          yield {
            type: WORKFLOW_EVENTS.ERROR,
            status: STATUS.ERROR,
            error: serializedError,
            previousContext: context,
            newContext: context
          };
        }
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


