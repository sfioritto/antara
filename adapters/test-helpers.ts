import type { Workflow, Event, Step } from "../dsl";
import { WORKFLOW_EVENTS } from "../dsl";
import type { Adapter } from "./adapter";

export async function runWorkflow(
  workflow: Workflow<any>,
  initialContext: any,
  adapters: Adapter[] = []
) {
  const events = [];
  for await (const event of workflow.run({ initialContext })) {
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
  workflow: AsyncGenerator<Event<T, any>>
): Promise<Event<T, any>> {
  const events = await collectWorkflowEvents(workflow);
  const lastEvent = events[events.length - 1] as Event<T, any>;
  if (lastEvent.type !== WORKFLOW_EVENTS.COMPLETE && lastEvent.type !== WORKFLOW_EVENTS.ERROR) {
    throw new Error('Workflow did not complete');
  }
  return lastEvent;
}

export async function* runWorkflowStepByStep(
  workflow: Workflow<any>,
  initialContext: any,
  adapters: Adapter[] = [],
  initialCompletedSteps: Step<any>[] = [],
  options: { workflowRunId?: number } = {}
): AsyncGenerator<Event<any, any>> {
  for await (const event of workflow.run({ initialContext, initialCompletedSteps, options })) {
    await Promise.all(adapters.map((adapter) => adapter.dispatch(event)));
    yield event;
  }
}
