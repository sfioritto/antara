interface Builder {
  step<TAction>(
    title: string,
    action: () => TAction,
    reduce: (result: TAction) => void,
  ): Builder,
  run(): void,
}

function createBuilder(steps: string[] = []): Builder {
  return {
    step(title: string, action, reduce) {
      const result = action();
      reduce(result);
      return createBuilder([...steps, title]);
    },
    run() {
      console.log(steps.join(' '))
    }
  }
}

function createWorkflow() {
  return createBuilder();
}

const workflow = createWorkflow();

workflow
  .step('first', () => 'first step action', (result) => console.log(result))
  .step('step', () => 'second step action', (result) => console.log(result)).run();