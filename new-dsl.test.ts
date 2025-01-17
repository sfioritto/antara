import { createWorkflow, Event } from './dsl/new-dsl';
import { WORKFLOW_EVENTS, STATUS } from './dsl/constants';
import { JsonObject } from './dsl/types';

describe('workflow creation', () => {
  it('should create a workflow with steps and run through them', async () => {
    const workflow = createWorkflow('test workflow')
      .step(
        "First step",
        () => ({ count: 1 })
      )
      .step(
        "Second step",
        ({ context }) => ({ doubled: context.count * 2 })
      );

    const workflowRun = workflow.run({});

    // Check start event
    const startResult = await workflowRun.next();
    expect(startResult.value).toEqual({
      workflowName: 'test workflow',
      type: WORKFLOW_EVENTS.START,
      status: STATUS.RUNNING,
      previousContext: {},
      newContext: {},
      steps: [
        { title: 'First step', status: STATUS.PENDING, context: {} },
        { title: 'Second step', status: STATUS.PENDING, context: {} }
      ],
      options: {}
    });

    // Check first step completion
    const firstStepResult = await workflowRun.next();
    expect(firstStepResult.value).toEqual({
      workflowName: 'test workflow',
      type: WORKFLOW_EVENTS.UPDATE,
      status: STATUS.RUNNING,
      previousContext: {},
      newContext: { count: 1 },
      completedStep: { title: 'First step', status: STATUS.COMPLETE, context: { count: 1 } },
      steps: [
        { title: 'First step', status: STATUS.COMPLETE, context: { count: 1 } },
        { title: 'Second step', status: STATUS.PENDING, context: { count: 1 } }
      ],
      options: {}
    });

    // Check second step completion
    const secondStepResult = await workflowRun.next();
    expect(secondStepResult.value).toEqual({
      workflowName: 'test workflow',
      type: WORKFLOW_EVENTS.UPDATE,
      status: STATUS.RUNNING,
      previousContext: { count: 1 },
      newContext: { count: 1, doubled: 2 },
      completedStep: { title: 'Second step', status: STATUS.COMPLETE, context: { count: 1, doubled: 2 } },
      steps: [
        { title: 'First step', status: STATUS.COMPLETE, context: { count: 1 } },
        { title: 'Second step', status: STATUS.COMPLETE, context: { count: 1, doubled: 2 } }
      ],
      options: {}
    });

    // Check workflow completion
    const completeResult = await workflowRun.next();
    expect(completeResult.value).toEqual({
      workflowName: 'test workflow',
      type: WORKFLOW_EVENTS.COMPLETE,
      status: STATUS.COMPLETE,
      previousContext: {},
      newContext: { count: 1, doubled: 2 },
      steps: [
        { title: 'First step', status: STATUS.COMPLETE, context: { count: 1 } },
        { title: 'Second step', status: STATUS.COMPLETE, context: { count: 1, doubled: 2 } }
      ],
      options: {}
    });
  });

  it('should create a workflow with a name and description when passed an object', async () => {
    const workflow = createWorkflow({
      name: 'my named workflow',
      description: 'some description'
    });

    const workflowRun = workflow.run({});
    const startResult = await workflowRun.next();
    expect(startResult.value).toEqual({
      workflowName: 'my named workflow',
      description: 'some description',
      type: WORKFLOW_EVENTS.START,
      status: STATUS.RUNNING,
      previousContext: {},
      newContext: {},
      steps: [],
      options: {}
    });
  });

  it('should create a workflow with just a name when passed a string', async () => {
    const workflow = createWorkflow('simple workflow');
    const workflowRun = workflow.run({});
    const startResult = await workflowRun.next();
    expect(startResult.value).toEqual({
      workflowName: 'simple workflow',
      type: WORKFLOW_EVENTS.START,
      status: STATUS.RUNNING,
      previousContext: {},
      newContext: {},
      steps: [],
      options: {}
    });
  });
});

describe('error handling', () => {
  it('should handle errors in steps and maintain correct status/context', async () => {
    const workflow = createWorkflow('Error Workflow')
      .step(
        "First step",
        () => ({ value: 1 })
      )
      .step(
        "Error step",
        (): void => {
          throw new Error('Test error');
        }
      )
      .step(
        "Never reached",
        ({ context }) => ({ value: context.value + 1 })
      );

    const workflowRun = workflow.run({});

    // Check start event
    const startResult = await workflowRun.next();
    expect(startResult.value).toEqual({
      workflowName: 'Error Workflow',
      type: WORKFLOW_EVENTS.START,
      status: STATUS.RUNNING,
      previousContext: {},
      newContext: {},
      steps: [
        { title: 'First step', status: STATUS.PENDING, context: {} },
        { title: 'Error step', status: STATUS.PENDING, context: {} },
        { title: 'Never reached', status: STATUS.PENDING, context: {} }
      ],
      options: {}
    });

    // Check first step completion
    const firstStepResult = await workflowRun.next();
    expect(firstStepResult.value).toEqual({
      workflowName: 'Error Workflow',
      type: WORKFLOW_EVENTS.UPDATE,
      status: STATUS.RUNNING,
      previousContext: {},
      newContext: { value: 1 },
      completedStep: { title: 'First step', status: STATUS.COMPLETE, context: { value: 1 } },
      steps: [
        { title: 'First step', status: STATUS.COMPLETE, context: { value: 1 } },
        { title: 'Error step', status: STATUS.PENDING, context: { value: 1 } },
        { title: 'Never reached', status: STATUS.PENDING, context: { value: 1 } }
      ],
      options: {}
    });

    // Check error step
    const errorResult = await workflowRun.next();
    expect(errorResult.value).toEqual({
      workflowName: 'Error Workflow',
      type: WORKFLOW_EVENTS.ERROR,
      status: STATUS.ERROR,
      previousContext: { value: 1 },
      newContext: { value: 1 },
      error: new Error('Test error'),
      completedStep: { title: 'Error step', status: STATUS.ERROR, context: { value: 1 } },
      steps: [
        { title: 'First step', status: STATUS.COMPLETE, context: { value: 1 } },
        { title: 'Error step', status: STATUS.ERROR, context: { value: 1 } },
        { title: 'Never reached', status: STATUS.PENDING, context: { value: 1 } }
      ],
      options: {}
    });

    // Verify workflow stops after error
    const noMoreResults = await workflowRun.next();
    expect(noMoreResults.done).toBe(true);
  });
});

describe('step immutability', () => {
  it('should maintain immutable steps across workflow events', async () => {
    interface SimpleContext extends JsonObject {
      value: number;
      [key: string]: any;
    }

    const workflow = createWorkflow<{}, SimpleContext>('Immutable Steps Workflow')
      .step(
        "Step 1",
        ({ context }) => ({ value: context.value + 1 })
      )
      .step(
        "Step 2",
        ({ context }) => ({ value: context.value * 2 })
      );

    const workflowRun = workflow.run({ initialContext: { value: 1 } });

    // Get past the START event
    const startResult = await workflowRun.next();
    expect(startResult.value).toEqual({
      workflowName: 'Immutable Steps Workflow',
      type: WORKFLOW_EVENTS.START,
      status: STATUS.RUNNING,
      previousContext: { value: 1 },
      newContext: { value: 1 },
      steps: [
        { title: 'Step 1', status: STATUS.PENDING, context: { value: 1 } },
        { title: 'Step 2', status: STATUS.PENDING, context: { value: 1 } }
      ],
      options: {}
    });

    // After first step completes, try to modify its data
    const firstStepResult = await workflowRun.next();
    const steps = firstStepResult.value?.steps;

    if (!steps) {
      throw new Error('Steps not found');
    }

    // Try to modify the first step's status and context
    steps[0].status = STATUS.PENDING;
    (steps[0].context as SimpleContext).value = 999;

    // Get the second step result
    const secondStepResult = await workflowRun.next();
    expect(secondStepResult.value).toEqual({
      workflowName: 'Immutable Steps Workflow',
      type: WORKFLOW_EVENTS.UPDATE,
      status: STATUS.RUNNING,
      previousContext: { value: 2 },
      newContext: { value: 4 },
      completedStep: { title: 'Step 2', status: STATUS.COMPLETE, context: { value: 4 } },
      steps: [
        { title: 'Step 1', status: STATUS.COMPLETE, context: { value: 2 } },
        { title: 'Step 2', status: STATUS.COMPLETE, context: { value: 4 } }
      ],
      options: {}
    });

    // Verify final state
    const finalResult = await workflowRun.next();
    expect(finalResult.value).toEqual({
      workflowName: 'Immutable Steps Workflow',
      type: WORKFLOW_EVENTS.COMPLETE,
      status: STATUS.COMPLETE,
      previousContext: { value: 1 },
      newContext: { value: 4 },
      steps: [
        { title: 'Step 1', status: STATUS.COMPLETE, context: { value: 2 } },
        { title: 'Step 2', status: STATUS.COMPLETE, context: { value: 4 } }
      ],
      options: {}
    });
  });
});

describe('workflow event sequence', () => {
  it('should emit events in correct order with proper context/status', async () => {
    interface SimpleContext extends JsonObject {
      value: number;
      [key: string]: any;
    }

    const workflow = createWorkflow<{}, SimpleContext>('Simple Workflow')
      .step(
        "Increment step",
        ({ context }) => ({ value: context.value + 1 })
      )
      .step(
        "Double step",
        ({ context }) => ({ value: context.value * 2 })
      );

    const events: Event<any, any, any>[] = [];
    const workflowRun = workflow.run({ initialContext: { value: 0 } });

    // Collect all events
    for await (const event of workflowRun) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        workflowName: 'Simple Workflow',
        type: WORKFLOW_EVENTS.START,
        status: STATUS.RUNNING,
        previousContext: { value: 0 },
        newContext: { value: 0 },
        steps: [
          { title: 'Increment step', status: STATUS.PENDING, context: { value: 0 } },
          { title: 'Double step', status: STATUS.PENDING, context: { value: 0 } }
        ],
        options: {}
      },
      {
        workflowName: 'Simple Workflow',
        type: WORKFLOW_EVENTS.UPDATE,
        status: STATUS.RUNNING,
        previousContext: { value: 0 },
        newContext: { value: 1 },
        completedStep: { title: 'Increment step', status: STATUS.COMPLETE, context: { value: 1 } },
        steps: [
          { title: 'Increment step', status: STATUS.COMPLETE, context: { value: 1 } },
          { title: 'Double step', status: STATUS.PENDING, context: { value: 1 } }
        ],
        options: {}
      },
      {
        workflowName: 'Simple Workflow',
        type: WORKFLOW_EVENTS.UPDATE,
        status: STATUS.RUNNING,
        previousContext: { value: 1 },
        newContext: { value: 2 },
        completedStep: { title: 'Double step', status: STATUS.COMPLETE, context: { value: 2 } },
        steps: [
          { title: 'Increment step', status: STATUS.COMPLETE, context: { value: 1 } },
          { title: 'Double step', status: STATUS.COMPLETE, context: { value: 2 } }
        ],
        options: {}
      },
      {
        workflowName: 'Simple Workflow',
        type: WORKFLOW_EVENTS.COMPLETE,
        status: STATUS.COMPLETE,
        previousContext: { value: 0 },
        newContext: { value: 2 },
        steps: [
          { title: 'Increment step', status: STATUS.COMPLETE, context: { value: 1 } },
          { title: 'Double step', status: STATUS.COMPLETE, context: { value: 2 } }
        ],
        options: {}
      }
    ]);
  });
});

describe('step completion', () => {
  it('should track step completion independently with correct context transformations', async () => {
    interface SimpleContext extends JsonObject {
      value: number;
      [key: string]: any;
    }

    const workflow = createWorkflow<{}, SimpleContext>('Two Step Workflow')
      .step(
        "Double step",
        ({ context }) => ({ value: context.value * 2 })
      )
      .step(
        "Add one step",
        ({ context }) => ({ value: context.value + 1 })
      );

    const stepCompletions: Array<{
      title: string;
      context: SimpleContext;
    }> = [];

    const workflowRun = workflow.run({ initialContext: { value: 1 } });

    // Skip START event
    await workflowRun.next();

    // Collect step completions from UPDATE events
    let result = await workflowRun.next();
    while (!result.done && result.value.type === WORKFLOW_EVENTS.UPDATE) {
      stepCompletions.push({
        title: result.value.completedStep!.title,
        context: result.value.completedStep!.context as SimpleContext
      });
      result = await workflowRun.next();
    }

    // Verify final state
    expect(result.value).toEqual({
      workflowName: 'Two Step Workflow',
      type: WORKFLOW_EVENTS.COMPLETE,
      status: STATUS.COMPLETE,
      previousContext: { value: 1 },
      newContext: { value: 3 },
      steps: [
        { title: 'Double step', status: STATUS.COMPLETE, context: { value: 2 } },
        { title: 'Add one step', status: STATUS.COMPLETE, context: { value: 3 } }
      ],
      options: {}
    });

    // Verify step completions happened in correct order with correct contexts
    expect(stepCompletions).toEqual([
      {
        title: 'Double step',
        context: { value: 2 }
      },
      {
        title: 'Add one step',
        context: { value: 3 }
      }
    ]);
  });
});