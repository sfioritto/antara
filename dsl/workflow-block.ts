import { LocalFileStore } from '../file-stores';
import { WORKFLOW_EVENTS, STATUS } from './constants';
import type {
  WorkflowConfiguration,
  Context,
  Step,
  Event,
  WorkflowEventBlock
} from './types';
import { StepBlock } from './step-block';

const workflowNames = new Map<string, string>();

export class WorkflowBlock<ContextShape> {
  public type = 'workflow';
  private configuration: WorkflowConfiguration = {
    fileStore: new LocalFileStore(),
  };

  constructor(
    public name: string,
    public blocks: (StepBlock<ContextShape> | WorkflowEventBlock<ContextShape>)[],
    public description?: string
  ) {
    if (workflowNames.has(name)) {
      throw new Error(`Workflow name "${name}" already exists. Names must be unique.`);
    }
    workflowNames.set(name, name);
  }

  get stepBlocks(): StepBlock<ContextShape>[] {
    return this.blocks.filter((block): block is StepBlock<ContextShape> => block.type === 'step');
  }

  get eventBlocks(): WorkflowEventBlock<ContextShape>[] {
    return this.blocks.filter((block): block is WorkflowEventBlock<ContextShape> => block.type === 'workflow');
  }

  configure(configuration: Partial<WorkflowConfiguration>) {
    this.configuration = {
      ...this.configuration,
      ...configuration,
    };
    return this;
  }

  #steps(
    currentContext: ContextShape,
    completedSteps: Step<ContextShape>[] = [],
  ): Step<ContextShape>[] {
    return this.stepBlocks.map((stepBlock, index) => {
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

  async #dispatchEvents(event: Event<ContextShape>) {
    for (const eventBlock of this.eventBlocks) {
      if (eventBlock.eventType === event.type) {
        await eventBlock.handler(structuredClone(event));
      }
    }
  }

  async *run<Options = any>(args: {
    initialContext: Context<ContextShape>,
    initialCompletedSteps?: Step<ContextShape>[],
    options?: Options,
  }): AsyncGenerator<Event<ContextShape>> {
    const {
      initialContext,
      options,
      initialCompletedSteps = [],
    } = structuredClone(args);

    const startEvent = {
      workflowName: this.name,
      previousContext: initialContext,
      newContext: initialContext,
      type: initialCompletedSteps.length > 0 ? WORKFLOW_EVENTS.RESTART : WORKFLOW_EVENTS.START,
      status: STATUS.PENDING,
      steps: this.#steps(initialContext, initialCompletedSteps),
      options,
    };
    await this.#dispatchEvents(startEvent);
    yield startEvent;

    let currentContext = initialCompletedSteps.length > 0
      ? initialCompletedSteps[initialCompletedSteps.length - 1].context
      : initialContext;
    let completedSteps = [...initialCompletedSteps];

    for (const stepBlock of this.stepBlocks.slice(initialCompletedSteps.length)) {
      const completedStep = await stepBlock.run({
        context: currentContext,
        options,
        configuration: this.configuration,
      });
      completedSteps.push(completedStep);

      const { error, context: nextContext } = completedStep;

      if (error) {
        console.error(error.message);
        const errorEvent = {
          workflowName: this.name,
          previousContext: currentContext,
          newContext: nextContext,
          status: STATUS.ERROR,
          error,
          steps: this.#steps(nextContext, completedSteps),
          options,
          type: WORKFLOW_EVENTS.ERROR,
        };
        await this.#dispatchEvents(errorEvent);
        yield errorEvent;
        return;
      } else {
        const updateEvent = {
          workflowName: this.name,
          completedStep,
          previousContext: currentContext,
          newContext: nextContext,
          status: STATUS.RUNNING,
          steps: this.#steps(nextContext, completedSteps),
          options,
          type: WORKFLOW_EVENTS.UPDATE,
        };
        await this.#dispatchEvents(updateEvent);
        yield updateEvent;
        currentContext = nextContext;
      }
    }

    const completeEvent = {
      workflowName: this.name,
      previousContext: currentContext,
      newContext: currentContext,
      type: WORKFLOW_EVENTS.COMPLETE,
      status: STATUS.COMPLETE,
      steps: this.#steps(currentContext, completedSteps),
      options,
    };
    await this.#dispatchEvents(completeEvent);
    yield completeEvent;
  }
}