import { v4 as uuidv4 } from 'uuid';
import { JsonObject } from 'type-fest';

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
}

type Context<ContextShape> = ContextShape extends JsonObject ? ContextShape : never;
type Action<ContextShape, ResultShape> = (context: ContextShape) => (Promise<ResultShape> | ResultShape);
type Reducer<ContextShape, ResultShape> = (result: ResultShape, context: ContextShape) => ContextShape;

interface ActionBlock<ContextShape, ResultShape> {
  type: "action";
  fn: Action<ContextShape, ResultShape>;
}

interface ReducerBlock<ContextShape, ResultShape> {
  type: "reducer";
  fn: Reducer<ContextShape, ResultShape>;
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

type StepEventHandler<ContextShape, ResultShape> = (params: {
  eventType: StepEventTypes,
  context: ContextShape | null,
  status: StatusOptions,
  result?: ResultShape,
  error?: SerializedError
}) => void;

type WorkflowEventHandler<ContextShape> = (params: {
  eventType: WorkflowEventTypes;
  context: ContextShape | null;
  status: StatusOptions;
  error?: SerializedError;
  stepResults: StepResult<ContextShape>[];
}) => void;

interface StepResult<ContextShape> {
  id: string
  title: string
  status: StatusOptions
  context: ContextShape
  error?: SerializedError
}

// Class to manage step block state and logic
class StepBlock<ContextShape, ResultShape = any> {
  public id = uuidv4();

  constructor(
    public title: string,
    public action: ActionBlock<ContextShape, ResultShape>,
    public events: StepEventBlock<ContextShape, ResultShape>[],
    public reducer?: ReducerBlock<ContextShape, ResultShape>,
  ) { }

  async dispatchEvents(args: {
    eventType: StepEventTypes,
    context: ContextShape,
    status: StatusOptions,
    result?: ResultShape,
    error?: SerializedError,
  }) {
    for (const event of this.events) {
      if (event.eventType === args.eventType) {
        await event.handler(args);
      }
    }
  }

  async run(context: ContextShape): Promise<StepResult<ContextShape>> {
    try {
      const result = await this.action.fn(context);
      const nextContext = structuredClone(this.reducer?.fn(result, context) ?? context);
      await this.dispatchEvents({
        eventType: 'step:complete',
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
        eventType: 'step:error',
        context,
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
        context,
        status: 'error',
      };
    }
  }
}

class WorkflowBlock<ContextShape> {
  public id = uuidv4();

  constructor(
    public title: string,
    public steps: StepBlock<ContextShape>[],
    public events: WorkflowEventBlock<ContextShape>[],
    public description?: string
  ) { }

  #stepResults(
    currentContext: ContextShape,
    results: StepResult<ContextShape>[] = [],
  ): StepResult<ContextShape>[] {
    // If a step has an error then all of the steps after it will not create a result
    // But we want to return a result for each step, so we stub one out for each step
    // that comes after the step with an error
    return this.steps.map((step): StepResult<ContextShape> => {
      const result = results.find((result) => result.id === step.id);
      if (!result) {
        return {
          id: step.id,
          title: step.title,
          status: 'pending',
          context: currentContext,
        };
      }
      return result;
    });
  }

  async dispatchEvents(args: {
    eventType: WorkflowEventTypes,
    stepResults: StepResult<ContextShape>[],
    context: ContextShape,
    status: StatusOptions,
    error?: SerializedError,
  }) {
    for (const event of this.events) {
      if (event.eventType === args.eventType) {
        await event.handler(args);
      }
    }
  }

  async run(initialContext: Context<ContextShape>): Promise<{
    error?: SerializedError;
    context: ContextShape;
    stepResults: StepResult<ContextShape>[];
    status: StatusOptions;
  }> {
    let clonedInitialContext = structuredClone(initialContext);

    await this.dispatchEvents({
      eventType: 'workflow:start',
      context: clonedInitialContext,
      status: 'pending',
      stepResults: this.#stepResults(clonedInitialContext),
    });

    let currentContext = clonedInitialContext as ContextShape;
    let results: StepResult<ContextShape>[] = [];
    for (const step of this.steps) {
      const result = await step.run(currentContext);
      results.push(result);

      const { error, context: nextContext } = result;

      if (error) {
        console.error(error.message);
        await this.dispatchEvents({
          eventType: 'workflow:error',
          context: nextContext,
          status: 'error',
          error,
          stepResults: this.#stepResults(nextContext, results),
        });
        break;
      } else {
        await this.dispatchEvents({
          eventType: 'workflow:update',
          context: nextContext,
          status: 'running',
          stepResults: this.#stepResults(nextContext, results),
        });
        currentContext = nextContext;
      }
    }

    await this.dispatchEvents({
      eventType: 'workflow:complete',
      context: currentContext,
      status: 'complete',
      stepResults: this.#stepResults(currentContext, results),
    });

    return {
      context: currentContext,
      stepResults: this.#stepResults(currentContext, results),
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
  fn: Action<ContextShape, ResultShape>
): ActionBlock<ContextShape, ResultShape> => ({
  type: "action",
  fn
});

const reduce = <ContextShape, ResultShape>(
  fn: Reducer<ContextShape, ResultShape>
): ReducerBlock<ContextShape, ResultShape> => ({
  type: "reducer",
  fn,
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
  ...args: Array<StepBlock<ContextShape> | WorkflowEventBlock<ContextShape>>
): WorkflowBlock<ContextShape> => {
  // Convert string to WorkflowMetadata if needed
  const normalizedMetadata = typeof metadata === 'string'
    ? { title: metadata }
    : metadata;

  const { title, description } = normalizedMetadata;

  const workflowEvents = args.filter((arg): arg is WorkflowEventBlock<ContextShape> =>
    'type' in arg && arg.type === 'workflow'
  );
  const steps = args.filter((arg): arg is StepBlock<ContextShape> =>
    !('type' in arg && arg.type === 'workflow')
  );

  return new WorkflowBlock(title, steps, workflowEvents, description);
};

export { workflow, step, action, reduce, on };