import { v4 as uuidv4 } from 'uuid';
import { JsonObject } from 'type-fest';

type State<StateShape> = StateShape extends JsonObject ? StateShape : never;
type Action<StateShape, ResultShape = any> = (state: StateShape) => (Promise<ResultShape> | ResultShape);
type Reducer<StateShape, ResultShape> = (result: ResultShape, state: StateShape) => StateShape;

interface ActionBlock<StateShape, ResultShape> {
  type: "action";
  fn: Action<StateShape, ResultShape>;
}

interface ReducerBlock<StateShape, ResultShape> {
  type: "reducer";
  fn: Reducer<StateShape, ResultShape>;
}

interface StepEventBlock<StateShape, ResultShape> {
  type: "event";
  eventType: StepEventTypes;
  handler: StepEventHandler<StateShape, ResultShape>;
}

interface WorkflowEventBlock<StateShape> {
  type: "workflow";
  eventType: WorkflowEventTypes;
  handler: WorkflowEventHandler<StateShape>;
}

interface WorkflowMetadata {
  title: string;
  description?: string;
}

interface WorkflowBlock<StateShape> extends WorkflowMetadata {
  run: (initialState: State<StateShape>) => Promise<{
    state: State<StateShape>,
    steps: Omit<StepBlock<StateShape>, 'run'>[],
    status: 'pending' | 'running' | 'complete' | 'error',
  }>;
}

type StepEventTypes = 'step:complete' | 'step:error';

type WorkflowEventTypes =
  | 'workflow:start'
  | 'workflow:complete'
  | 'workflow:update'
  | 'workflow:error';

type AllEventTypes = StepEventTypes | WorkflowEventTypes;

type StatusOptions = 'pending' | 'running' | 'complete' | 'error';

type StepEventHandler<StateShape, ResultShape> = (params: {
  event: StepEventTypes,
  state: StateShape | null,
  status: StatusOptions,
  result?: ResultShape,
  error?: Error
}) => void;

type WorkflowEventHandler<StateShape> = (params: {
  event: WorkflowEventTypes;
  state: StateShape | null;
  status: StatusOptions;
  error?: Error;
}) => void;

// Function to dispatch events to the appropriate handlers
async function dispatchEvents<StateShape, ResultShape>(
  events: Array<StepEventBlock<StateShape, ResultShape> | WorkflowEventBlock<StateShape>>,
  eventType: AllEventTypes,
  params: {
    id: string,
    title: string,
    state: StateShape | null,
    status: StatusOptions,
    error?: Error,
    result?: ResultShape,
  }
) {
  for (const event of events) {
    if (event.eventType === eventType) {
      if (event.type === "workflow") {
        await event.handler({
          event: eventType as WorkflowEventTypes,
          state: params.state,
          status: params.status,
          error: params.error,
        });
      } else {
        await event.handler({
          event: eventType as StepEventTypes,
          state: params.state,
          status: params.status,
          result: params.result,
          error: params.error,
        });
      }
    }
  }
}

// Class to manage step block state and logic
class StepBlock<StateShape, ResultShape = any> {
  public id: string;
  public title: string;
  public action: ActionBlock<StateShape, ResultShape>;
  public events: StepEventBlock<StateShape, ResultShape>[];
  public reducer?: ReducerBlock<StateShape, ResultShape>;
  public status: 'pending' | 'running' | 'complete' | 'error';
  public error?: Error;
  public state: StateShape | null;

  constructor(
    title: string,
    action: ActionBlock<StateShape, ResultShape>,
    events: StepEventBlock<StateShape, ResultShape>[],
    reducer?: ReducerBlock<StateShape, ResultShape>,
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

const serializedStepBlock = function <StateShape, ResultShape>(step: StepBlock<StateShape, ResultShape>) {
  return structuredClone({
    id: step.id,
    title: step.title,
    action: step.action,
    events: step.events,
    reducer: step.reducer,
    status: step.status,
    state: step.state,
    error: step.error,
  });
}

// Block builders
function on<StateShape, ResultShape>(
  event: StepEventTypes,
  handler: StepEventHandler<StateShape, ResultShape>
): StepEventBlock<StateShape, ResultShape>;
function on<StateShape>(
  event: WorkflowEventTypes,
  handler: WorkflowEventHandler<StateShape>
): WorkflowEventBlock<StateShape>;
 function on<StateShape, ResultShape>(
   event: AllEventTypes,
   handler: StepEventHandler<StateShape, ResultShape> | WorkflowEventHandler<StateShape>
 ): StepEventBlock<StateShape, ResultShape> | WorkflowEventBlock<StateShape>{
  if (event.startsWith('workflow:')) {
    return {
      type: "workflow",
      eventType: event as WorkflowEventTypes,
      handler: handler as WorkflowEventHandler<StateShape>,
    };
  }

  return {
    type: "event",
    eventType: event as StepEventTypes,
    handler: handler as StepEventHandler<StateShape, ResultShape>,
  };
}

const action = <StateShape, ResultShape>(
  fn: Action<StateShape, ResultShape>
): ActionBlock<StateShape, ResultShape> => ({
  type: "action",
  fn
});

const reduce = <StateShape, ResultShape>(
  fn: Reducer<StateShape, ResultShape>
): ReducerBlock<StateShape, ResultShape> => ({
  type: "reducer",
  fn,
});

function step<StateShape, ResultShape>(
  title: string,
  ...args: | [ActionBlock<StateShape, ResultShape>, ...StepEventBlock<StateShape, ResultShape>[]]
        | [ActionBlock<StateShape, ResultShape>, ReducerBlock<StateShape, ResultShape>, ...StepEventBlock<StateShape, ResultShape>[]]
): StepBlock<StateShape, ResultShape> {
  const [action, ...rest] = args;
  const hasReducer = rest[0]?.type === "reducer";
  const reducer = hasReducer ? rest[0] as ReducerBlock<StateShape, ResultShape> : undefined;
  const events = (hasReducer ? rest.slice(1) : rest) as StepEventBlock<StateShape, ResultShape>[];

  return new StepBlock(title, action, events, reducer);
}

const workflow = <StateShape>(
  metadata: string | WorkflowMetadata,
  ...args: Array<StepBlock<StateShape> | WorkflowEventBlock<StateShape>>
): WorkflowBlock<StateShape> => {
  // Convert string to WorkflowMetadata if needed
  const normalizedMetadata = typeof metadata === 'string'
    ? { title: metadata }
    : metadata;

  const workflowId = uuidv4();
  const { title: workflowTitle } = normalizedMetadata;

  const workflowEvents = args.filter((arg): arg is WorkflowEventBlock<StateShape> =>
    'type' in arg && arg.type === 'workflow'
  );
  const steps = args.filter((arg): arg is StepBlock<StateShape> =>
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
        steps: steps.map(serializedStepBlock),
        status: 'complete',
      };
    },
  }
};

export { workflow, step, action, reduce, on };