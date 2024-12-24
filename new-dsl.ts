import { v4 as uuidv4 } from 'uuid';
import { JsonObject } from 'type-fest';

type State<StateShape> = StateShape extends JsonObject ? StateShape : never;
type Action<StateShape> = (state: StateShape) => (Promise<any> | any);

interface Step<StateShape> {
  id: string;
  title: string;
  action: Action<StateShape>;
}

interface ActionStep<StateShape> {
  type: "action";
  fn: Action<StateShape>;
}

// Core builders
const action = <StateShape>(fn: Action<StateShape>): ActionStep<StateShape> => ({
  type: "action",
  fn
});

function step<StateShape>(
  title: string,
  action: ActionStep<StateShape>
): Step<StateShape> {
  return {
    id: uuidv4(),
    title,
    action: () => 'cool'
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
        for (const { id, title, action } of steps) {
          const result = await action(state);
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
    action((state) => console.log(state.hello)),
  ),
).run(initialState).then(finalState => finalState.hello);