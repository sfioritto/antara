interface Builder {
  step(title: string, action: () => void): Builder,
  run(): void,
}

function createBuilder(steps: string[] = []): Builder {
  return {
    step(title: string, action) {
      action();
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
  .step('first', () => console.log('first step action'))
  .step('step', () => console.log('second step action')).run();