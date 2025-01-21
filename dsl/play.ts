function createBuilder(steps: string[] = []) {
  return {
    step(title: string) {
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

workflow.step('first').step('step').run();