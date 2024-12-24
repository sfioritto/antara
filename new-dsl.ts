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

type EventHandler<StateShape, ResultShape> = ({ event, state, result, error }: {
  event: StepEventTypes,
  state: StateShape,
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

const on = <StateShape, ResultShape>(
  event: StepEventTypes,
  handler: EventHandler<StateShape, ResultShape>
): Event<StateShape, ResultShape> => ({
  type: "event",
  event,
  handler,
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
  run: (initialState: State<StateShape>) => Promise<{ state: State<StateShape>, status: StepStatus<StateShape>[] }>
} => {
  return {
    run: async (initialState) => {
      let state = JSON.parse(JSON.stringify(initialState));
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
          state = JSON.parse(JSON.stringify(reducer?.fn(result, state) ?? state));
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
          status.state = JSON.parse(JSON.stringify(state));
        }
      }

      return {
        state,
        status: stepStatuses,
      };
    },
  }
};