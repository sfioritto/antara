import type { z } from 'zod';

type JsonPrimitive = string | number | boolean | null;
type JsonArray = JsonValue[];
type JsonObject = { [Key in string]?: JsonValue };
type JsonValue = JsonPrimitive | JsonArray | JsonObject;

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
}

// Use a mapped type to ensure all properties are serializable
type Context<ContextShape> = ContextShape extends object
  ? { [K in keyof ContextShape]: ContextShape[K] extends JsonValue ? ContextShape[K] : never }
  : never;

type Action<ContextShape, ResultShape> = (context: ContextShape) => (Promise<ResultShape> | ResultShape);
type Reducer<ContextShape, ResultShape> = (result: ResultShape, context: ContextShape) => ContextShape;

interface ActionBlock<ContextShape, ResultShape> {
  type: "action";
  handler: Action<ContextShape, ResultShape>;
}

interface ReducerBlock<ContextShape, ResultShape> {
  type: "reducer";
  handler: Reducer<ContextShape, ResultShape>;
}

interface StepEventBlock<ContextShape> {
  type: "event";
  eventType: StepEventTypes;
  handler: EventHandler<ContextShape>;
}

interface WorkflowEventBlock<ContextShape> {
  type: "workflow";
  eventType: WorkflowEventTypes;
  handler: EventHandler<ContextShape>;
}

interface WorkflowMetadata {
  name: string;
  description?: string;
}

const STEP_EVENTS = {
  COMPLETE: 'step:complete',
  ERROR: 'step:error',
} as const;

type StepEventTypes = typeof STEP_EVENTS[keyof typeof STEP_EVENTS];

const WORKFLOW_EVENTS = {
  START: 'workflow:start',
  RESTART: 'workflow:restart',
  UPDATE: 'workflow:update',
  ERROR: 'workflow:error',
  COMPLETE: 'workflow:complete',
} as const;

const STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETE: 'complete',
  ERROR: 'error',
} as const;

type WorkflowEventTypes = typeof WORKFLOW_EVENTS[keyof typeof WORKFLOW_EVENTS];
type StatusOptions = typeof STATUS[keyof typeof STATUS];

type AllEventTypes = StepEventTypes | WorkflowEventTypes;

interface Event<ContextShape, Options = any> {
  workflowName?: string,
  previousContext: ContextShape,
  newContext: ContextShape,
  error?: SerializedError,
  type: AllEventTypes,
  status: StatusOptions,
  completedStep?: Step<ContextShape>,
  steps?: Step<ContextShape>[],
  options?: Options,
}

type EventHandler<ContextShape> = (event: Event<ContextShape>) => void;

interface Step<ContextShape> {
  title: string
  status: StatusOptions
  context: ContextShape
  error?: SerializedError
}

class StepBlock<ContextShape, ResultShape = any> {
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

  async run<Options = any>(context: ContextShape, options?: Options): Promise<Step<ContextShape>> {
    const clonedContext = structuredClone(context);
    try {
      const result = await this.actionBlock.handler(clonedContext);
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

const workflowNames = new Map<string, string>();

class WorkflowBlock<ContextShape> {
  public type = 'workflow';

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

  #steps(
    currentContext: ContextShape,
    completedSteps: Step<ContextShape>[] = [],
  ): Step<ContextShape>[] {
    // If a step has an error then all of the steps after it will not create a result
    // But we want to return a result for each step, so we stub one out for each step
    // that comes after the step with an error
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
      const completedStep = await stepBlock.run(currentContext, options);
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

// Block builders
function on<ContextShape>(
  event: StepEventTypes,
  handler: EventHandler<ContextShape>
): StepEventBlock<ContextShape>;
function on<ContextShape>(
  event: WorkflowEventTypes,
  handler: EventHandler<ContextShape>
): WorkflowEventBlock<ContextShape>;
 function on<ContextShape>(
   event: AllEventTypes,
   handler: EventHandler<ContextShape>
 ): StepEventBlock<ContextShape> | WorkflowEventBlock<ContextShape>{
  if (event.startsWith('workflow:')) {
    return {
      type: "workflow",
      eventType: event as WorkflowEventTypes,
      handler: handler as EventHandler<ContextShape>,
    };
  }

  return {
    type: "event",
    eventType: event as StepEventTypes,
    handler: handler as EventHandler<ContextShape>,
  };
}

const reduce = <ContextShape, ResultShape>(
  handler: Reducer<ContextShape, ResultShape>
): ReducerBlock<ContextShape, ResultShape> => ({
  type: "reducer",
  handler,
});

function action<ContextShape, ResultShape>(
  handler: Action<ContextShape, ResultShape>
): ActionBlock<ContextShape, ResultShape>;
function action<ContextShape, WorkflowContextShape>(
  workflow: WorkflowBlock<WorkflowContextShape>,
  initialState: (() => WorkflowContextShape) | WorkflowContextShape
): ActionBlock<ContextShape, WorkflowContextShape>;
function action<ContextShape, ResultShape>(
  handlerOrWorkflow: Action<ContextShape, ResultShape> | WorkflowBlock<ResultShape>,
  initialState?: (() => ResultShape) | ResultShape
): ActionBlock<ContextShape, ResultShape> {
  if (handlerOrWorkflow instanceof WorkflowBlock) {
    if (!initialState) {
      throw new Error("initialState is required when using a workflow as an action");
    }
    return {
      type: "action",
      handler: async () => {
        let finalContext: ResultShape | undefined;
        const initialContext = (initialState instanceof Function)
          ? initialState()
          : initialState;

        for await (const event of handlerOrWorkflow.run({
          initialContext: initialContext as Context<ResultShape>
        })) {
          if (event.type === WORKFLOW_EVENTS.COMPLETE) {
            finalContext = event.newContext;
          }
          if (event.type === WORKFLOW_EVENTS.ERROR && event.error) {
            const error = new Error(event.error.message);
            error.name = event.error.name;
            error.stack = event.error.stack;
            throw error;
          }
        }

        if (!finalContext) {
          throw new Error("Workflow did not complete successfully");
        }

        return finalContext;
      }
    };
  }

  return {
    type: "action",
    handler: handlerOrWorkflow,
  };
}

interface PromptConfig {
  model?: 'gpt-4' | 'claude-3' | 'gemini' | string;
  temperature?: number;
  maxTokens?: number;
}

const getProjectConfig = () => ({
  model: 'gpt-4',
  temperature: 0.5,
  maxTokens: 1000,
});

const executePrompt = async <ResultShape>(...args: any[]) => {
  return 'result' as ResultShape;
}

export function prompt<ContextShape, ResultShape extends z.ZodType>(
  template: (context: ContextShape) => string,
  responseModel: {
    schema: ResultShape,
    name: string
  },
  options?: Partial<PromptConfig>
): ActionBlock<ContextShape, ResultShape> {
  return {
    type: "action",
    handler: async (context: ContextShape) => {
      const config = {
        ...getProjectConfig(),
        ...options
      };

      const promptString = template(context);

      const result = await executePrompt(promptString, config, responseModel);

      return result as ResultShape;
    }
  };
}

function step<ContextShape, ResultShape>(
  title: string,
  ...args: | [ActionBlock<ContextShape, ResultShape>, ...StepEventBlock<ContextShape>[]]
        | [ActionBlock<ContextShape, ResultShape>, ReducerBlock<ContextShape, ResultShape>, ...StepEventBlock<ContextShape>[]]
): StepBlock<ContextShape, ResultShape> {
  const [action, ...rest] = args;
  const hasReducer = rest[0]?.type === "reducer";
  const reducer = hasReducer ? rest[0] as ReducerBlock<ContextShape, ResultShape> : undefined;
  const events = (hasReducer ? rest.slice(1) : rest) as StepEventBlock<ContextShape>[];

  return new StepBlock(title, action, events, reducer);
}

const workflow = <ContextShape>(
  metadata: WorkflowMetadata | string,
  ...blocks: Array<StepBlock<ContextShape> | WorkflowEventBlock<ContextShape>>
): WorkflowBlock<ContextShape> => {
  const normalizedMetadata = typeof metadata === "string"
    ? { name: metadata }
    : metadata;

  const { name, description } = normalizedMetadata;
  return new WorkflowBlock(name, blocks, description);
};

export { workflow, step, action, reduce, on, WORKFLOW_EVENTS, STEP_EVENTS, STATUS };
export type {
  JsonValue,
  JsonObject,
  JsonArray,
  JsonPrimitive,
  Context,
  Action,
  Reducer,
  ActionBlock,
  ReducerBlock,
  StepEventBlock,
  WorkflowEventBlock,
  WorkflowMetadata,
  StepEventTypes,
  WorkflowEventTypes,
  StatusOptions,
  AllEventTypes,
  EventHandler,
  SerializedError,
  Step,
  Event,
  StepBlock,
  WorkflowBlock,
};
