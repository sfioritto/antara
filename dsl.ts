import { v4 as uuidv4 } from 'uuid';
import { JsonObject } from 'type-fest';

type State<StateShape> = StateShape extends JsonObject ? StateShape : never;
type ActionHandler<StateShape, ResultShape = any> = (state: StateShape) => (Promise<ResultShape> | ResultShape);
type ReduceHandler<StateShape, ResultShape> = (result: ResultShape, state: StateShape) => StateShape;

interface Action<StateShape, ResultShape> {
  type: "action";
  fn: ActionHandler<StateShape, ResultShape>;
}

interface Reducer<StateShape, ResultShape> {
  type: "reducer";
  fn: ReduceHandler<StateShape, ResultShape>;
}

type StepEventTypes = 'step:complete' | 'step:error';

type EventHandler<StateShape, ResultShape> = (params: {
  event?: StepEventTypes,
  state: StateShape | null,
  result?: ResultShape,
  error?: Error
}) => void;

interface StepEvent<StateShape, ResultShape> {
  type: "event";
  event: StepEventTypes;
  handler: EventHandler<StateShape, ResultShape>;
}

interface Step<StateShape, ResultShape = any> {
  id: string;
  title: string;
  action: Action<StateShape, ResultShape>;
  reducer?: Reducer<StateShape, ResultShape>;
  events: StepEvent<StateShape, ResultShape>[];
  status: 'pending' | 'running' | 'complete' | 'error';
  error?: Error;
  state: StateShape | null;
  run: (state: StateShape) => Promise<{
    error?: Error;
    state: StateShape,
  }>;
}

type WorkflowEventTypes =
  | 'workflow:start'
  | 'workflow:complete'
  | 'workflow:update'
  | 'workflow:error';

type WorkflowEventHandler<StateShape> = (params: {
  event: WorkflowEventTypes;
  state: StateShape | null;
  status: 'pending' | 'running' | 'complete' | 'error';
  error?: Error;
}) => void;

interface WorkflowEvent<StateShape> {
  type: "workflow";
  event: WorkflowEventTypes;
  handler: WorkflowEventHandler<StateShape>;
}

type AllEventTypes = StepEventTypes | WorkflowEventTypes;

function on<StateShape, ResultShape>(
  event: StepEventTypes,
  handler: EventHandler<StateShape, ResultShape>
): StepEvent<StateShape, ResultShape>;
function on<StateShape>(
  event: WorkflowEventTypes,
  handler: WorkflowEventHandler<StateShape>
): WorkflowEvent<StateShape>;
function on<StateShape, ResultShape>(
  event: AllEventTypes,
  handler: EventHandler<StateShape, ResultShape> | WorkflowEventHandler<StateShape>
): StepEvent<StateShape, ResultShape> | WorkflowEvent<StateShape> {
  if (event.startsWith('workflow:')) {
    return {
      type: "workflow",
      event: event as WorkflowEventTypes,
      handler: handler as WorkflowEventHandler<StateShape>,
    };
  }
  return {
    type: "event",
    event: event as StepEventTypes,
    handler: handler as EventHandler<StateShape, ResultShape>,
  };
}

// Core builders
const action = <StateShape, ResultShape>(
  fn: ActionHandler<StateShape, ResultShape>
): Action<StateShape, ResultShape> => ({
  type: "action",
  fn
});

const reduce = <StateShape, ResultShape>(
  fn: ReduceHandler<StateShape, ResultShape>
): Reducer<StateShape, ResultShape> => ({
  type: "reducer",
  fn,
});

type StepArgs<StateShape, ResultShape> =
  | [Action<StateShape, ResultShape>, ...StepEvent<StateShape, ResultShape>[]]
  | [Action<StateShape, ResultShape>, Reducer<StateShape, ResultShape>, ...StepEvent<StateShape, ResultShape>[]];

async function dispatchEvents<StateShape, ResultShape>(
  events: Array<StepEvent<StateShape, ResultShape> | WorkflowEvent<StateShape>>,
  eventType: AllEventTypes,
  params: {
    id: string,
    title: string,
    state: StateShape | null,
    status: 'pending' | 'running' | 'complete' | 'error',
    error?: Error,
    result?: ResultShape,
  }
) {
  for (const event of events) {
    if (event.event === eventType) {
      if (event.type === "workflow") {
        await event.handler({
          event: eventType as WorkflowEventTypes,
          ...params,
        });
      } else {
        await event.handler({
          event: eventType as StepEventTypes,
          ...params
        });
      }
    }
  }
}

class StepClass<StateShape, ResultShape> {
  public id: string;
  public title: string;
  public action: Action<StateShape, ResultShape>;
  public events: StepEvent<StateShape, ResultShape>[];
  public reducer?: Reducer<StateShape, ResultShape>;
  public status: 'pending' | 'running' | 'complete' | 'error';
  public error?: Error;
  public state: StateShape | null;

  constructor(
    title: string,
    action: Action<StateShape, ResultShape>,
    events: StepEvent<StateShape, ResultShape>[],
    reducer?: Reducer<StateShape, ResultShape>,
  ) {
    this.id = uuidv4();
    this.title = title;
    this.action = action;
    this.events = events;
    this.reducer = reducer;
    this.status = 'pending';
    this.state = null;
  }

  async run(state: StateShape): Promise<{
    error?: Error;
    state: StateShape;
  }> {
    try {
      const result = await this.action.fn(state);
      const nextState = this.reducer?.fn(result, state) ?? state;
      this.state = structuredClone(nextState);
      this.status = 'complete';
      await dispatchEvents(this.events, 'step:complete', {
        id: this.id,
        title: this.title,
        state: this.state,
        status: this.status,
        result,
        error: this.error,
      });
      return {
        state: nextState
      };
    } catch (error) {
      this.error = error as Error;
      this.status = 'error';
      await dispatchEvents(this.events, 'step:error', {
        id: this.id,
        title: this.title,
        state: this.state,
        status: this.status,
        error: this.error,
      });
      return {
        error: this.error,
        state: state
      };
    }
  }
}

function step<StateShape, ResultShape>(
  title: string,
  ...args: StepArgs<StateShape, ResultShape>
): StepClass<StateShape, ResultShape> {
  const [action, ...rest] = args;
  const hasReducer = rest[0]?.type === "reducer";
  const reducer = hasReducer ? rest[0] as Reducer<StateShape, ResultShape> : undefined;
  const events = (hasReducer ? rest.slice(1) : rest) as StepEvent<StateShape, ResultShape>[];

  return new StepClass(title, action, events, reducer);
}

interface WorkflowMetadata {
  title: string;
  description?: string;
}

interface Workflow<StateShape> extends WorkflowMetadata {
  run: (initialState: State<StateShape>) => Promise<{
    state: State<StateShape>,
    steps: Step<StateShape>[],
    status: 'pending' | 'running' | 'complete' | 'error',
  }>;
}

const workflow = <StateShape>(
  metadata: string | WorkflowMetadata,
  ...args: Array<Step<StateShape> | WorkflowEvent<StateShape>>
): Workflow<StateShape> => {
  // Convert string to WorkflowMetadata if needed
  const normalizedMetadata: WorkflowMetadata = typeof metadata === 'string'
    ? { title: metadata }
    : metadata;

  const workflowId = uuidv4();
  const { title: workflowTitle } = normalizedMetadata;

  const workflowEvents = args.filter((arg): arg is WorkflowEvent<StateShape> =>
    'type' in arg && arg.type === 'workflow'
  );
  const steps = args.filter((arg): arg is Step<StateShape> =>
    !('type' in arg && arg.type === 'workflow')
  );

  return {
    ...normalizedMetadata,
    run: async (initialState) => {
      let clonedInitialState = structuredClone(initialState);

      await dispatchEvents(
        workflowEvents,
        'workflow:start', {
          id: workflowId,
          title: workflowTitle,
          state: clonedInitialState,
          status: 'pending',
        }
      );

      let currentState = clonedInitialState as StateShape;
      for (const step of steps) {
        const { state: nextState, error } = await step.run(currentState);
        if (error) {
          await dispatchEvents(workflowEvents, 'workflow:error', {
            id: workflowId,
            title: workflowTitle,
            state: nextState,
            status: 'error',
            error: error as Error,
          });
          break;
        } else {
          await dispatchEvents(
            workflowEvents,
            'workflow:update', {
              id: workflowId,
              title: workflowTitle,
              state: nextState,
              status: 'running',
            }
          );
          currentState = nextState;
        }
      }

      await dispatchEvents(
        workflowEvents,
        'workflow:complete', {
          id: workflowId,
          title: workflowTitle,
          state: currentState,
          status: 'complete',
        }
      );

      return {
        state: currentState as State<StateShape>,
        steps,
        status: 'complete',
      };
    },
  }
};

export { workflow, step, action, reduce, on };