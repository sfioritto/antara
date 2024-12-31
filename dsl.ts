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

type StepEventTypes = 'step:complete' | 'step:error';

type WorkflowEventTypes =
  | 'workflow:start'
  | 'workflow:complete'
  | 'workflow:update'
  | 'workflow:error';

type AllEventTypes = StepEventTypes | WorkflowEventTypes;

type StatusOptions = 'pending' | 'running' | 'complete' | 'error';

type Event<ContextShape> = {
  context: ContextShape,
  status: StatusOptions,
  error?: SerializedError
}

type StepEvent<ContextShape, ResultShape> = Event<ContextShape> & {
  type: StepEventTypes,
  result?: ResultShape,
}

type WorkflowEvent<ContextShape> = Event<ContextShape> & {
  type: WorkflowEventTypes,
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

  async dispatchEvents(args: {
    type: StepEventTypes,
    context: ContextShape,
    status: StatusOptions,
    result?: ResultShape,
    error?: SerializedError,
  }) {
    for (const event of this.eventBlocks) {
      if (event.eventType === args.type) {
        await event.handler(structuredClone(args));
      }
    }
  }

  async run(context: ContextShape): Promise<Step<ContextShape>> {
    const clonedContext = structuredClone(context);
    try {
      const result = await this.actionBlock.handler(clonedContext);
      const nextContext = this.reducerBlock?.handler(result, clonedContext) ?? clonedContext;
      await this.dispatchEvents({
        type: 'step:complete',
        context: nextContext,
        status: 'complete',
        result,
      });
      return {
        id: this.id,
        title: this.title,
        context: nextContext,
        status: 'complete',
      };
    } catch (err) {
      const error = err as Error;
      await this.dispatchEvents({
        type: 'step:error',
        context: clonedContext,
        status: 'error',
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

class WorkflowBlock<ContextShape> {
  public id = uuidv4();
  public type = 'workflow';

  constructor(
    public title: string,
    public blocks: (StepBlock<ContextShape> | WorkflowEventBlock<ContextShape>)[],
    public description?: string
  ) { }

  get #stepBlocks(): StepBlock<ContextShape>[] {
    return this.blocks.filter((block): block is StepBlock<ContextShape> => block.type === 'step');
  }

  get #eventBlocks(): WorkflowEventBlock<ContextShape>[] {
    return this.blocks.filter((block): block is WorkflowEventBlock<ContextShape> => block.type === 'workflow');
  }

  #steps(
    currentContext: ContextShape,
    results: Step<ContextShape>[] = [],
  ): Step<ContextShape>[] {
    // If a step has an error then all of the steps after it will not create a result
    // But we want to return a result for each step, so we stub one out for each step
    // that comes after the step with an error
    return this.#stepBlocks
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

  async dispatchEvents(args: {
    type: WorkflowEventTypes,
    steps: Step<ContextShape>[],
    context: ContextShape,
    status: StatusOptions,
    error?: SerializedError,
  }) {
    for (const event of this.#eventBlocks) {
      if (event.eventType === args.type) {
        await event.handler(structuredClone(args));
      }
    }
  }

  async run(initialContext: Context<ContextShape>): Promise<{
    error?: SerializedError;
    context: ContextShape;
    steps: Step<ContextShape>[];
    status: StatusOptions;
  }> {
    let clonedInitialContext = structuredClone(initialContext);

    await this.dispatchEvents({
      type: 'workflow:start',
      context: clonedInitialContext,
      status: 'pending',
      steps: this.#steps(clonedInitialContext),
    });

    let currentContext = clonedInitialContext as ContextShape;
    let results: Step<ContextShape>[] = [];
    for (const step of this.#stepBlocks) {
      const result = await step.run(currentContext);
      results.push(result);

      const { error, context: nextContext } = result;

      if (error) {
        console.error(error.message);
        await this.dispatchEvents({
          type: 'workflow:error',
          context: nextContext,
          status: 'error',
          error,
          steps: this.#steps(nextContext, results),
        });
        break;
      } else {
        await this.dispatchEvents({
          type: 'workflow:update',
          context: nextContext,
          status: 'running',
          steps: this.#steps(nextContext, results),
        });
        currentContext = nextContext;
      }
    }

    await this.dispatchEvents({
      type: 'workflow:complete',
      context: currentContext,
      status: 'complete',
      steps: this.#steps(currentContext, results),
    });

    return {
      context: currentContext,
      steps: this.#steps(currentContext, results),
      status: 'complete',
    };
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

export { workflow, step, action, reduce, on };