import { WORKFLOW_EVENTS } from './dsl/constants';
import { Adapter } from "./adapters/adapter";
import type { JsonObject } from './dsl/types';
import type { Event } from './dsl/new-dsl';
import type { FileStore } from "./file-stores";

interface Logger {
  log(...args: any[]): void;
}

export class WorkflowRunner {
  constructor(
    private options: {
      adapters: Adapter[],
      fileStore?: FileStore,
      logger: Logger,
      verbose: boolean
    }
  ) {}

  async run<
    WorkflowOptions extends JsonObject,
    InitialContext extends JsonObject
  >(
    workflow: {
      run: (params: {
        initialContext?: InitialContext,
        initialCompletedSteps?: Array<{
          title: string,
          status: string,
          context: JsonObject
        }>,
        options?: WorkflowOptions,
        configuration?: {
          fileStore?: FileStore,
          logger: Logger,
          verbose: boolean
        }
      }) => AsyncGenerator<Event<JsonObject, JsonObject, WorkflowOptions>, void, unknown>
    },
    initialContext?: InitialContext,
    initialCompletedSteps: Array<{
      title: string,
      status: string,
      context: JsonObject
    }> = [],
    options: WorkflowOptions = {} as WorkflowOptions
  ) {
    const { adapters, fileStore, logger, verbose } = this.options;

    for await (const event of workflow.run({
      initialContext,
      initialCompletedSteps,
      options,
      configuration: {
        fileStore,
        logger,
        verbose
      }
    })) {
      await Promise.all(
        adapters.map((adapter) => adapter.dispatch(event))
      );

      if (event.completedStep) {
        logger.log(`${event.completedStep.title} ✅`);
      }

      if ((
        event.type === WORKFLOW_EVENTS.COMPLETE ||
        event.type === WORKFLOW_EVENTS.ERROR
      ) && verbose) {
        logger.log(`Workflow completed: \n\n ${JSON.stringify(
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