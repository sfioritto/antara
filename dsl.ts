import { v4 as uuidv4 } from 'uuid';

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

interface StepEventBlock<ContextShape, ResultShape> {
  type: "event";
  eventType: StepEventTypes;
  handler: StepEventHandler<ContextShape, ResultShape>;
}

interface WorkflowEventBlock<ContextShape> {
  type: "workflow";
  eventType: WorkflowEventTypes;
  handler: WorkflowEventHandler<ContextShape>;
}

interface WorkflowMetadata {
  title: string;
  description?: string;
}

const STEP_EVENTS = {
  COMPLETE: 'step:complete',
  ERROR: 'step:error',
} as const;

type StepEventTypes = typeof STEP_EVENTS[keyof typeof STEP_EVENTS];

const WORKFLOW_EVENTS = {
  START: 'workflow:start',
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

interface Event<ContextShape> {
  title: string,
  initialContext: ContextShape,
  context: ContextShape,
  error?: SerializedError,
  type: StepEventTypes | WorkflowEventTypes,
}

interface StepEvent<ContextShape, ResultShape> extends Event<ContextShape> {
  result?: ResultShape,
}

interface WorkflowEvent<ContextShape> extends Event<ContextShape> {
  status: StatusOptions,
  steps: Step<ContextShape>[],
}

type StepEventHandler<ContextShape, ResultShape> = (event: StepEvent<ContextShape, ResultShape>) => void;

type WorkflowEventHandler<ContextShape> = (event: WorkflowEvent<ContextShape>) => void;

interface Step<ContextShape> {
  id: string
  title: string
  status: StatusOptions
  context: ContextShape
  error?: SerializedError
}

// Class to manage step block state and logic
class StepBlock<ContextShape, ResultShape = any> {
  public id = uuidv4();
  public type = 'step';

  constructor(
    public title: string,
    public actionBlock: ActionBlock<ContextShape, ResultShape>,
    public eventBlocks: StepEventBlock<ContextShape, ResultShape>[],
    public reducerBlock?: ReducerBlock<ContextShape, ResultShape>,
  ) { }

  get blocks() {
    if (this.reducerBlock) {
      return [this.actionBlock, this.reducerBlock, ...this.eventBlocks];
    }
    return [this.actionBlock, ...this.eventBlocks];
  }

  async #dispatchEvents(args: {
    type: StepEventTypes,
    initialContext: ContextShape,
    context: ContextShape,
    result?: ResultShape,
    error?: SerializedError,
  }) {
    for (const event of this.eventBlocks) {
      if (event.eventType === args.type) {
        await event.handler(structuredClone({
          ...args,
          title: this.title,
        }));
      }
    }
  }

  async run(context: ContextShape): Promise<Step<ContextShape>> {
    const clonedContext = structuredClone(context);
    try {
      const result = await this.actionBlock.handler(clonedContext);
      const context = this.reducerBlock?.handler(result, clonedContext) ?? clonedContext;
      await this.#dispatchEvents({
        type: 'step:complete',
        initialContext: clonedContext,
        context,
        result,
      });
      return {
        id: this.id,
        title: this.title,
        context,
        status: 'complete',
      };
    } catch (err) {
      const error = err as Error;
      await this.#dispatchEvents({
        type: 'step:error',
        initialContext: clonedContext,
        context: clonedContext,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
      });
      return {
        id: this.id,
        title: this.title,
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        context: clonedContext,
        status: 'error',
      };
    }
  }
}

const workflowTitles = new Map<string, string>();

class WorkflowBlock<ContextShape> {
  public type = 'workflow';

  constructor(
    public title: string,
    public blocks: (StepBlock<ContextShape> | WorkflowEventBlock<ContextShape>)[],
    public description?: string
  ) {
    if (workflowTitles.has(title)) {
      throw new Error(`Workflow title "${title}" already exists. Titles must be unique.`);
    }
    workflowTitles.set(title, title);
  }

  get stepBlocks(): StepBlock<ContextShape>[] {
    return this.blocks.filter((block): block is StepBlock<ContextShape> => block.type === 'step');
  }

  get eventBlocks(): WorkflowEventBlock<ContextShape>[] {
    return this.blocks.filter((block): block is WorkflowEventBlock<ContextShape> => block.type === 'workflow');
  }

  #steps(
    currentContext: ContextShape,
    results: Step<ContextShape>[] = [],
  ): Step<ContextShape>[] {
    // If a step has an error then all of the steps after it will not create a result
    // But we want to return a result for each step, so we stub one out for each step
    // that comes after the step with an error
    return this.stepBlocks
      .map((stepBlock) => {
        const result = results.find((result) => result.id === stepBlock.id);
        if (!result) {
          return {
            id: stepBlock.id,
            title: stepBlock.title,
            status: 'pending',
            context: currentContext,
          };
        }
        return result;
      });
  }

  async #dispatchEvents(args: WorkflowEvent<ContextShape>) {
    for (const event of this.eventBlocks) {
      if (event.eventType === args.type) {
        await event.handler(structuredClone(args));
      }
    }
  }

  async *run(initialContext: Context<ContextShape>): AsyncGenerator<
    WorkflowEvent<ContextShape> | StepEvent<ContextShape, any>
  > {
    let clonedInitialContext = structuredClone(initialContext);

    const startEvent = {
      title: this.title,
      initialContext: clonedInitialContext,
      context: clonedInitialContext,
      type: WORKFLOW_EVENTS.START,
      status: STATUS.PENDING,
      steps: this.#steps(clonedInitialContext),
    };
    await this.#dispatchEvents(startEvent);
    yield startEvent;

    let currentContext = clonedInitialContext as ContextShape;
    let results: Step<ContextShape>[] = [];

    for (const step of this.stepBlocks) {
      const result = await step.run(currentContext);
      results.push(result);

      const { error, context: nextContext } = result;

      if (error) {
        console.error(error.message);
        const errorEvent = {
          title: this.title,
          initialContext: clonedInitialContext,
          context: nextContext,
          status: STATUS.ERROR,
          error,
          steps: this.#steps(nextContext, results),
        };
        await this.#dispatchEvents({
          ...errorEvent,
          type: WORKFLOW_EVENTS.ERROR,
        });
        yield {
          ...errorEvent,
          title: step.title,
          type: STEP_EVENTS.ERROR,
        }
        yield {
          ...errorEvent,
          type: WORKFLOW_EVENTS.ERROR,
        };
        return;
      } else {
        const updateEvent = {
          title: this.title,
          initialContext: clonedInitialContext,
          context: nextContext,
          status: STATUS.RUNNING,
          steps: this.#steps(nextContext, results),
        };
        await this.#dispatchEvents({
          ...updateEvent,
          type: WORKFLOW_EVENTS.UPDATE,
        });
        yield {
          ...updateEvent,
          title: step.title,
          type: STEP_EVENTS.COMPLETE,
        };
        yield {
          ...updateEvent,
          type: WORKFLOW_EVENTS.UPDATE,
        };
        currentContext = nextContext;
      }
    }

    const completeEvent = {
      title: this.title,
      initialContext: clonedInitialContext,
      context: currentContext,
      type: WORKFLOW_EVENTS.COMPLETE,
      status: STATUS.COMPLETE,
      steps: this.#steps(currentContext, results),
    };
    await this.#dispatchEvents(completeEvent);
    yield completeEvent;
  }
}

// Block builders
function on<ContextShape, ResultShape>(
  event: StepEventTypes,
  handler: StepEventHandler<ContextShape, ResultShape>
): StepEventBlock<ContextShape, ResultShape>;
function on<ContextShape>(
  event: WorkflowEventTypes,
  handler: WorkflowEventHandler<ContextShape>
): WorkflowEventBlock<ContextShape>;
 function on<ContextShape, ResultShape>(
   event: AllEventTypes,
   handler: StepEventHandler<ContextShape, ResultShape> | WorkflowEventHandler<ContextShape>
 ): StepEventBlock<ContextShape, ResultShape> | WorkflowEventBlock<ContextShape>{
  if (event.startsWith('workflow:')) {
    return {
      type: "workflow",
      eventType: event as WorkflowEventTypes,
      handler: handler as WorkflowEventHandler<ContextShape>,
    };
  }

  return {
    type: "event",
    eventType: event as StepEventTypes,
    handler: handler as StepEventHandler<ContextShape, ResultShape>,
  };
}

const action = <ContextShape, ResultShape>(
  handler: Action<ContextShape, ResultShape>
): ActionBlock<ContextShape, ResultShape> => ({
  type: "action",
  handler,
});

const reduce = <ContextShape, ResultShape>(
  handler: Reducer<ContextShape, ResultShape>
): ReducerBlock<ContextShape, ResultShape> => ({
  type: "reducer",
  handler,
});

function step<ContextShape, ResultShape>(
  title: string,
  ...args: | [ActionBlock<ContextShape, ResultShape>, ...StepEventBlock<ContextShape, ResultShape>[]]
        | [ActionBlock<ContextShape, ResultShape>, ReducerBlock<ContextShape, ResultShape>, ...StepEventBlock<ContextShape, ResultShape>[]]
): StepBlock<ContextShape, ResultShape> {
  const [action, ...rest] = args;
  const hasReducer = rest[0]?.type === "reducer";
  const reducer = hasReducer ? rest[0] as ReducerBlock<ContextShape, ResultShape> : undefined;
  const events = (hasReducer ? rest.slice(1) : rest) as StepEventBlock<ContextShape, ResultShape>[];

  return new StepBlock(title, action, events, reducer);
}

const workflow = <ContextShape>(
  metadata: string | WorkflowMetadata,
  ...blocks: Array<StepBlock<ContextShape> | WorkflowEventBlock<ContextShape>>
): WorkflowBlock<ContextShape> => {
  // Convert string to WorkflowMetadata if needed
  const normalizedMetadata = typeof metadata === 'string'
    ? { title: metadata }
    : metadata;

  const { title, description } = normalizedMetadata;

  return new WorkflowBlock(title, blocks, description);
};

export { workflow, step, action, reduce, on, WORKFLOW_EVENTS, STEP_EVENTS };
export type { Event, WorkflowEvent, StepEvent, WorkflowBlock as Workflow };