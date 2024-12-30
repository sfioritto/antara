import { v4 as uuidv4 } from 'uuid';
import { JsonObject } from 'type-fest';

type SerializedError = {
  name: string;
  message: string;
  stack?: string;
}

type Context<ContextShape> = ContextShape extends JsonObject ? ContextShape : never;
type Action<ContextShape, ResultShape = any> = (context: ContextShape) => (Promise<ResultShape> | ResultShape);
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
  event: StepEventTypes,
  context: ContextShape | null,
  status: StatusOptions,
  result?: ResultShape,
  error?: SerializedError
}) => void;

type WorkflowEventHandler<ContextShape> = (params: {
  event: WorkflowEventTypes;
  context: ContextShape | null;
  status: StatusOptions;
  error?: SerializedError;
}) => void;

// Function to dispatch events to the appropriate handlers
async function dispatchEvents<ContextShape, ResultShape>(
  events: Array<StepEventBlock<ContextShape, ResultShape> | WorkflowEventBlock<ContextShape>>,
  eventType: AllEventTypes,
  params: {
    id: string,
    title: string,
    context: ContextShape | null,
    status: StatusOptions,
    error?: SerializedError,
    result?: ResultShape,
  }
) {
  for (const event of events) {
    if (event.eventType === eventType) {
      if (event.type === "workflow") {
        await event.handler({
          event: eventType as WorkflowEventTypes,
          context: params.context,
          status: params.status,
          error: params.error,
        });
      } else {
        await event.handler({
          event: eventType as StepEventTypes,
          context: params.context,
          status: params.status,
          result: params.result,
          error: params.error,
        });
      }
    }
  }
}

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
  ) {}

  async run(context: ContextShape): Promise<StepResult<ContextShape>> {
    try {
      const result = await this.action.fn(context);
      const nextContext = structuredClone(this.reducer?.fn(result, context) ?? context);
      await dispatchEvents(this.events, 'step:complete', {
        id: this.id,
        title: this.title,
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
      await dispatchEvents(this.events, 'step:error', {
        id: this.id,
        title: this.title,
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
  ) {}

  async run(initialContext: Context<ContextShape>): Promise<{
    error?: SerializedError;
    context: Context<ContextShape>;
    stepResults: StepResult<ContextShape>[];
    status: StatusOptions;
  }> {
    let clonedInitialContext = structuredClone(initialContext);

    await dispatchEvents(this.events, 'workflow:start', {
      id: this.id,
      title: this.title,
      context: clonedInitialContext,
      status: 'pending',
    });

    let currentContext = clonedInitialContext as ContextShape;
    let results: StepResult<ContextShape>[] = [];
    for (const step of this.steps) {
      const result = await step.run(currentContext);
      results.push(result);

      const { error, context: nextContext } = result;

      if (error) {
        console.error(error);
        await dispatchEvents(this.events, 'workflow:error', {
          id: this.id,
          title: this.title,
          context: nextContext,
          status: 'error',
          error: error as SerializedError,
        });
        break;
      } else {
        await dispatchEvents(this.events, 'workflow:update', {
          id: this.id,
          title: this.title,
          context: nextContext,
          status: 'running',
        });
        currentContext = nextContext;
      }
    }

    await dispatchEvents(this.events, 'workflow:complete', {
      id: this.id,
      title: this.title,
      context: currentContext,
      status: 'complete',
    });

    return {
      context: currentContext as Context<ContextShape>,
      stepResults: results,
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