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
