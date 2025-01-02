import type { Workflow } from "../dsl";
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

export async function finalWorkflowEvent<T>(workflow: AsyncGenerator<T>): Promise<T> {
  const events = await collectWorkflowEvents(workflow);
  return events[events.length - 1];
}
