import { WorkflowBlock, Step } from "./dsl";
import { Adapter } from "./adapters/adapter";
import type { Context } from "./dsl";

export class WorkflowRunner<T> {
  constructor(
    private adapters: Adapter[] = [],
  ) {}

  async run(
    workflow: WorkflowBlock<T>,
    initialContext: Context<T>,
    initialCompletedSteps: Step<T>[] = [],
    options: Record<string, any> = {}
  ) {
    for await (const event of workflow.run({
      initialContext,
      initialCompletedSteps,
      options,
    })) {
      await Promise.all(this.adapters.map((adapter) => adapter.dispatch(event)));
    }
  }
}