import { v4 as uuidv4 } from 'uuid';
import { JsonObject } from 'type-fest';

type State<StateShape> = StateShape extends JsonObject ? StateShape : never;
type Action<StateShape> = (state: StateShape) => (Promise<any> | any);
type Reduce<StateShape> = (result, state: StateShape) => StateShape;

interface Step<StateShape> {
  id: string;
  title: string;
  action: ActionStep<StateShape>;
  reducer?: ReducerStep<StateShape>;
}

interface ActionStep<StateShape> {
  type: "action";
  fn: Action<StateShape>;
}

interface ReducerStep<StateShape> {
  type: "reducer";
  fn: Reduce<StateShape>;
}

// Core builders
const action = <StateShape>(fn: Action<StateShape>): ActionStep<StateShape> => ({
  type: "action",
  fn
});

const reduce = <StateShape>(fn: Reduce<StateShape>): ReducerStep<StateShape> => ({
  type: "reducer",
  fn,
})

function step<StateShape>(
  title: string,
  action: ActionStep<StateShape>,
  reducer?: ReducerStep<StateShape>,
): Step<StateShape> {
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
  run: (initialState: State<StateShape>) => Promise<State<StateShape>>
} => {
  return {
    run: async (initialState) => {
      let state = JSON.parse(JSON.stringify(initialState));
      try {
        for (const { id, title, action, reducer } of steps) {
          const result = await action.fn(state);
          state = reducer?.fn(result, state) ?? state;
        }
      } catch {

      } finally {

      }

      return state;
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
).run(initialState).then(finalState => finalState.hello);