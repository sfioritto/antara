import { WORKFLOW_EVENTS } from './dsl/constants';
import type { WorkflowBlock, Step } from './dsl/types';
import { Adapter } from "./adapters/adapter";
import type { Context } from "./dsl/types";
import type { FileStore } from "./file-stores";

interface Logger {
  log(...args: any[]): void;
}

export class WorkflowRunner<T> {
  constructor(
    private options: {
      adapters: Adapter[],
      fileStore?: FileStore,
      logger: Logger,
      verbose: boolean
    }
  ) {}

  async run(
    workflow: WorkflowBlock<T>,
    initialContext: Context<T>,
    initialCompletedSteps: Step<T>[] = [],
    options: Record<string, any> = {}
  ) {
    const { logger: { log } } = this.options;
    for await (const event of workflow.run({
      initialContext,
      initialCompletedSteps,
      options,
    })) {
      await Promise.all(this.options.adapters.map((adapter) => adapter.dispatch(event)));
      if (event.completedStep) {
        log(`${event.completedStep.title} ✅`);
      }

      if ((
        event.type === WORKFLOW_EVENTS.COMPLETE ||
        event.type === WORKFLOW_EVENTS.ERROR
      ) && this.options.verbose) {
        log(`Workflow completed: \n\n ${JSON.stringify(
          this.truncateDeep(structuredClone(event.newContext)), null, 2
        )}`);
      }
    }
  }

  private truncateDeep(obj: any, maxLength: number = 100): any {
    if (obj === null || obj === undefined) return obj;

    if (typeof obj === 'string') {
      return obj.length > maxLength ? obj.slice(0, maxLength) + '...' : obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => this.truncateDeep(item, maxLength));
    }

    if (typeof obj === 'object') {
      const truncated: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
        truncated[key] = this.truncateDeep(value, maxLength);
      }
      return truncated;
    }

    return obj;
  }
}

