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
  type: "workflow_event";
  event: WorkflowEventTypes;
  handler: WorkflowEventHandler<StateShape>;
}

// ... existing code ...

// Combined event types
type AllEventTypes = StepEventTypes | WorkflowEventTypes;

// Combined handler type using function overloads
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
      type: "workflow_event",
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

const workflow = <StateShape>(
  ...steps: Step<StateShape>[]
): {
    run: (initialState: State<StateShape>) => Promise<{
      state: State<StateShape>,
      status: StepStatus<StateShape>[]
    }>
} => {
  return {
    run: async (initialState) => {
      let state = structuredClone(initialState);
      const stepStatuses: StepStatus<StateShape>[] = steps.map(step => ({
        id: step.id,
        name: step.title,
        status: 'pending',
        state: null
      }));

      for (const { id, action, reducer, events } of steps) {
        const status = stepStatuses.find(status => status.id === id);
        if (!status) {
          throw new Error(`Step ${id} not found in stepStatuses`);
        }
        status.status = 'running';
        try {
          const result = await action.fn(state);
          state = structuredClone(reducer?.fn(result, state) ?? state) as State<StateShape>;
          for (const { event, handler } of events) {
            if (event === 'step:complete') {
              await handler({ event, state, result });
            }
          }
        } catch (error) {
          status.status = 'error';
          status.error = error as Error;

          for (const { event, handler } of events) {
            if (event === 'step:error') {
              await handler({ event, state, error: error as Error });
            }
          }
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