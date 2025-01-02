import type { Workflow, WorkflowEvent, StepEvent } from "../dsl";
import { WORKFLOW_EVENTS } from "../dsl";
import type { Adapter } from "./adapter";

export async function runWorkflow(
  workflow: Workflow<any>,
  initialContext: any,
  adapters: Adapter[] = []
) {
  const events = [];
  for await (const event of workflow.run(initialContext)) {
    events.push(event);
    await Promise.all(adapters.map((adapter) => adapter.dispatch(event)));
  }
  return events;
}

export async function collectWorkflowEvents<T>(workflow: AsyncGenerator<T>): Promise<T[]> {
  const events: T[] = [];
  for await (const event of workflow) {
    events.push(event);
  }
  return events;
}

export async function finalWorkflowEvent<T>(
  workflow: AsyncGenerator<WorkflowEvent<T> | StepEvent<T, any>>
): Promise<WorkflowEvent<T>> {
  const events = await collectWorkflowEvents(workflow);
  const lastEvent = events[events.length - 1];
  if (lastEvent.type !== WORKFLOW_EVENTS.COMPLETE) {
    throw new Error('Workflow did not complete');
  }
  return lastEvent;
}
