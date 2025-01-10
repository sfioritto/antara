import { WorkflowBlock, Step } from "./dsl";
import { Adapter } from "./adapters/adapter";
import type { Context } from "./dsl";

interface Logger {
  log(...args: any[]): void;
}

export class WorkflowRunner<T> {
  constructor(
    private adapters: Adapter[] = [],
    private logger: Logger = console,
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
    }
  }
}

