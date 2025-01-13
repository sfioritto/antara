import { STEP_EVENTS, STATUS } from './constants';
import type {
  ActionBlock,
  ReducerBlock,
  StepEventBlock,
  Step,
  Event,
  WorkflowConfiguration
} from './types';

export class StepBlock<ContextShape, ResultShape = any> {
  public type = 'step';

  constructor(
    public title: string,
    public actionBlock: ActionBlock<ContextShape, ResultShape>,
    public eventBlocks: StepEventBlock<ContextShape>[],
    public reducerBlock?: ReducerBlock<ContextShape, ResultShape>,
  ) { }

  get blocks() {
    if (this.reducerBlock) {
      return [this.actionBlock, this.reducerBlock, ...this.eventBlocks];
    }
    return [this.actionBlock, ...this.eventBlocks];
  }

  async #dispatchEvents(event: Event<ContextShape>) {
    for (const eventBlock of this.eventBlocks) {
      if (eventBlock.eventType === event.type) {
        await eventBlock.handler(structuredClone(event));
      }
    }
  }

  async run<Options = any>(args: {
    context: ContextShape,
    options?: Options,
    configuration: WorkflowConfiguration
  }): Promise<Step<ContextShape>> {
    const { context, options, configuration } = args;
    const clonedContext = structuredClone(context);
    try {
      const result = await this.actionBlock.handler(clonedContext, configuration);
      const context = this.reducerBlock?.handler(result, clonedContext) ?? clonedContext;
      const completedStep = {
        title: this.title,
        context,
        status: STATUS.COMPLETE,
        options,
      };
      await this.#dispatchEvents({
        type: STEP_EVENTS.COMPLETE,
        previousContext: clonedContext,
        newContext: context,
        completedStep,
        status: STATUS.COMPLETE,
        options,
      });
      return completedStep;
    } catch (err) {
      const error = err as Error;
      await this.#dispatchEvents({
        type: STEP_EVENTS.ERROR,
        previousContext: clonedContext,
        newContext: clonedContext,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        status: STATUS.ERROR,
        options,
      });
      return {
        title: this.title,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        context: clonedContext,
        status: STATUS.ERROR,
      };
    }
  }
}