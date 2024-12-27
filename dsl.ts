import { v4 as uuidv4 } from 'uuid';
import { JsonObject } from 'type-fest';

type State<StateShape> = StateShape extends JsonObject ? StateShape : never;
type ActionHandler<StateShape, ResultShape = any> = (state: StateShape) => (Promise<ResultShape> | ResultShape);
type ReduceHandler<StateShape, ResultShape> = (result: ResultShape, state: StateShape) => StateShape;

interface StepStatus<StateShape> {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  error?: Error;
  state: StateShape | null;
}

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
  state?: StateShape,
  result?: ResultShape,
  error?: Error
}) => void;

interface Event<StateShape, ResultShape> {
  type: "event";
  event: StepEventTypes;
  handler: EventHandler<StateShape, ResultShape>;
}

interface Step<StateShape, ResultShape = any> {
  id: string;
  title: string;
  action: Action<StateShape, ResultShape>;
  reducer?: Reducer<StateShape, ResultShape>;
  events: Event<StateShape, ResultShape>[];
}

type WorkflowEventTypes =
  | 'workflow:start'
  | 'workflow:complete'
  | 'workflow:update'
  | 'workflow:error';

type WorkflowEventHandler<StateShape> = (params: {
  event: WorkflowEventTypes;
  status?: StepStatus<StateShape>;
  error?: Error;
  statuses: StepStatus<StateShape>[];
  state: StateShape;
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
): Event<StateShape, ResultShape>;
function on<StateShape>(
  event: WorkflowEventTypes,
  handler: WorkflowEventHandler<StateShape>
): WorkflowEvent<StateShape>;
function on<StateShape, ResultShape>(
  event: AllEventTypes,
  handler: EventHandler<StateShape, ResultShape> | WorkflowEventHandler<StateShape>
): Event<StateShape, ResultShape> | WorkflowEvent<StateShape> {
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
  | [Action<StateShape, ResultShape>, ...Event<StateShape, ResultShape>[]]
  | [Action<StateShape, ResultShape>, Reducer<StateShape, ResultShape>, ...Event<StateShape, ResultShape>[]];

function step<StateShape, ResultShape>(
  title: string,
  ...args: StepArgs<StateShape, ResultShape>
): Step<StateShape, ResultShape> {
  const [action, ...rest] = args;

  const hasReducer = rest[0]?.type === "reducer";
  const reducer = hasReducer ? rest[0] as Reducer<StateShape, ResultShape> : undefined;
  const events = (hasReducer ? rest.slice(1) : rest) as Event<StateShape, ResultShape>[];

  return {
    id: uuidv4(),
    title,
    action,
    reducer,
    events,
  };
}

async function dispatchEvents<StateShape, ResultShape>(
  events: Array<Event<StateShape, ResultShape> | WorkflowEvent<StateShape>>,
  eventType: AllEventTypes,
  params: {
    state: StateShape,
    statuses?: StepStatus<StateShape>[],
    result?: ResultShape,
    error?: Error
  }
) {
  for (const event of events) {
    if (event.event === eventType) {
      if (event.type === "workflow") {
        await event.handler({
          event: eventType as WorkflowEventTypes,
          ...params,
          statuses: params.statuses!
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

const workflow = <StateShape>(
  ...args: Array<Step<StateShape> | WorkflowEvent<StateShape>>
): {
    run: (initialState: State<StateShape>) => Promise<{
      state: State<StateShape>,
      status: StepStatus<StateShape>[],
    }>
} => {
  const events = args.filter((arg): arg is WorkflowEvent<StateShape> =>
    'type' in arg && arg.type === 'workflow'
  );
  const steps = args.filter((arg): arg is Step<StateShape> =>
    !('type' in arg) || arg.type !== 'workflow'
  );

  return {
    run: async (initialState) => {
      let state = structuredClone(initialState);
      const stepStatuses: StepStatus<StateShape>[] = steps.map(step => ({
        id: step.id,
        name: step.title,
        status: 'pending',
        state: null
      }));

      await dispatchEvents(events, 'workflow:start', { state, statuses: stepStatuses });

      for (const { id, action, reducer, events: stepEvents } of steps) {
        const status = stepStatuses.find(status => status.id === id);
        if (!status) {
          throw new Error(`Step ${id} not found in stepStatuses`);
        }
        status.status = 'running';
        try {
          const result = await action.fn(state);
          state = structuredClone(reducer?.fn(result, state) ?? state) as State<StateShape>;
          await dispatchEvents(stepEvents, 'step:complete', { state, result });
        } catch (error) {
          status.status = 'error';
          status.error = error as Error;
          await dispatchEvents(stepEvents, 'step:error', { state, error: error as Error });
        } finally {
          status.status = 'complete';
          status.state = structuredClone(state);
        }
      }

      return {
        state,
        status: stepStatuses,
      };
    },
  }
};

export { workflow, step, action, reduce, on };