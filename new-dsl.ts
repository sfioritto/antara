import { v4 as uuidv4 } from 'uuid';
import { JsonObject } from 'type-fest';

type State<StateShape> = StateShape extends JsonObject ? StateShape : never;
type Action<StateShape, ResultShape = any> = (state: StateShape) => (Promise<ResultShape> | ResultShape);
type Reduce<StateShape, ResultShape> = (result: ResultShape, state: StateShape) => StateShape;

interface StepStatus<StateShape> {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  error?: Error;
  state: StateShape | null;
}

interface ActionStep<StateShape, ResultShape> {
  type: "action";
  fn: Action<StateShape, ResultShape>;
}

interface ReducerStep<StateShape, ResultShape> {
  type: "reducer";
  fn: Reduce<StateShape, ResultShape>;
}

interface Step<StateShape, ResultShape = any> {
  id: string;
  title: string;
  action: ActionStep<StateShape, ResultShape>;
  reducer?: ReducerStep<StateShape, ResultShape>;
}

// Core builders
const action = <StateShape, ResultShape>(
  fn: Action<StateShape, ResultShape>
): ActionStep<StateShape, ResultShape> => ({
  type: "action",
  fn
});

const reduce = <StateShape, ResultShape>(
  fn: Reduce<StateShape, ResultShape>
): ReducerStep<StateShape, ResultShape> => ({
  type: "reducer",
  fn,
});

function step<StateShape, ResultShape>(
  title: string,
  action: ActionStep<StateShape, ResultShape>,
  reducer?: ReducerStep<StateShape, ResultShape>,
): Step<StateShape, ResultShape> {
  return {
    id: uuidv4(),
    title,
    action,
    reducer,
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

      for (const { id, title, action, reducer } of steps) {
        const status = stepStatuses.find(status => status.id === id);
        if (!status) {
          throw new Error(`Step ${id} not found in stepStatuses`);
        }
        status.status = 'running';
        try {
          const result = await action.fn(state);
          state = JSON.parse(JSON.stringify(reducer?.fn(result, state) ?? state));
        } catch (error) {
          status.status = 'error';
          status.error = error as Error;
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

// simple example to check types

const initialState: { hello: string } = { hello: "world" };

workflow<typeof initialState>(
  step(
    "First step",
    action((state): string => state.hello),
    reduce((result, state) => {
      return {
        ...state,
        hello: result,
      };
    })
  ),
).run(initialState).then(({ state, status }) => {
  console.log(status);
  return state.hello;
});