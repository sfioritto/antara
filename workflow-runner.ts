import { WorkflowBlock, Step, WORKFLOW_EVENTS } from "./dsl";
import { Adapter } from "./adapters/adapter";
import type { Context } from "./dsl";

interface Logger {
  log(...args: any[]): void;
}

interface RunnerOptions {
  verbose?: boolean;
}

export class WorkflowRunner<T> {
  constructor(
    private adapters: Adapter[] = [],
    private logger: Logger = console,
    private options: RunnerOptions = { verbose: false }
  ) {}

  async run(
    workflow: WorkflowBlock<T>,
    initialContext: Context<T>,
    initialCompletedSteps: Step<T>[] = [],
    options: Record<string, any> = {}
  ) {
    const { logger: { log } } = this;
    for await (const event of workflow.run({
      initialContext,
      initialCompletedSteps,
      options,
    })) {
      await Promise.all(this.adapters.map((adapter) => adapter.dispatch(event)));
      if (event.completedStep) {
        log(`${event.completedStep.title} ✅`);
      }

      if (event.type === WORKFLOW_EVENTS.COMPLETE && this.options.verbose) {
        log(`Workflow completed: \n\n ${JSON.stringify(event.newContext, null, 2)}`);
      }
    }
  }
}

