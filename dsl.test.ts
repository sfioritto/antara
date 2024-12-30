import { workflow, on, step, action, reduce } from './dsl';

describe('workflow creation', () => {
  it('should create a workflow with a name when passed a string', () => {
    const wf = workflow('my workflow');
    expect(wf.title).toBe('my workflow');
    // Since we only passed a string, we expect no description to be set
    expect(wf.description).toBeUndefined();
  });

  it('should create a workflow with a name and description when passed an object', () => {
    const wf = workflow({ title: 'my named workflow', description: 'some description' });
    expect(wf.title).toBe('my named workflow');
    expect(wf.description).toBe('some description');
  });
});

describe('workflow level event listeners', () => {
  it('should fire workflow events in correct order with proper state/status', async () => {
    interface SimpleContext {
      value: number;
    }

    const workflowEvents: Array<{
      type: string;
      status: string;
      context: SimpleContext;
    }> = [];
    const stepEvents: Array<{ type: string }> = [];

    const simpleWorkflow = workflow<SimpleContext>(
      'Simple Workflow',
      step(
        "Increment step",
        action(async (context: SimpleContext) => context.value + 1),
        reduce((newValue: number) => ({
          value: newValue,
        })),
        on('step:complete', () => {
          stepEvents.push({ type: 'step:complete' });
        })
      ),
      on('workflow:start', ({ status, context }) => {
        workflowEvents.push({ type: 'workflow:start', status, context });
      }),
      on('workflow:update', ({ status, context }) => {
        workflowEvents.push({ type: 'workflow:update', status, context });
      }),
      on('workflow:complete', ({ status, context }) => {
        workflowEvents.push({ type: 'workflow:complete', status, context });
      })
    );

    const { context, status } = await simpleWorkflow.run({ value: 0 });

    // Verify final context
    expect(context.value).toBe(1);
    expect(status).toBe('complete');

    // Verify workflow events
    expect(workflowEvents).toHaveLength(3);
    expect(workflowEvents[0]).toEqual({
      type: 'workflow:start',
      status: 'pending',
      context: { value: 0 }
    });
    expect(workflowEvents[1]).toEqual({
      type: 'workflow:update',
      status: 'running',
      context: { value: 1 }
    });
    expect(workflowEvents[2]).toEqual({
      type: 'workflow:complete',
      status: 'complete',
      context: { value: 1 }
    });

    // Verify step events
    expect(stepEvents).toEqual([{ type: 'step:complete' }]);
  });
});

describe('step level event listeners', () => {
  it('should fire step events only for their respective steps', async () => {
    interface SimpleContext {
      value: number;
    }

    const stepEvents: Array<{
      step: string;
      type: string;
      context: SimpleContext;
      result: number;
    }> = [];

    const twoStepWorkflow = workflow<SimpleContext>(
      'Two Step Workflow',
      step(
        "Double step",
        action(async (context) => context.value * 2),
        reduce((newValue: number) => ({
          value: newValue
        })),
        on('step:complete', ({ context, result }) => {
          stepEvents.push({
            step: 'double',
            type: 'step:complete',
            context,
            result
          });
        })
      ),
      step(
        "Add one step",
        action(async (context: SimpleContext) => context.value + 1),
        reduce((newValue: number) => ({
          value: newValue
        })),
        on('step:complete', ({ context, result }) => {
          stepEvents.push({
            step: 'add-one',
            type: 'step:complete',
            context,
            result
          });
        })
      )
    );

    const { context, status } = await twoStepWorkflow.run({ value: 1 });

    // Verify final context
    expect(context.value).toBe(3);
    expect(status).toBe('complete');

    // Verify step events
    expect(stepEvents).toHaveLength(2);
    expect(stepEvents[0]).toEqual({
      step: 'double',
      type: 'step:complete',
      context: { value: 2 },
      result: 2
    });
    expect(stepEvents[1]).toEqual({
      step: 'add-one',
      type: 'step:complete',
      context: { value: 3 },
      result: 3
    });
  });
});

describe('error handling', () => {
  it('should handle errors in actions and maintain correct contexts', async () => {
    interface SimpleContext {
      value: number;
    }

    const workflowEvents: Array<{
      type: string;
      stepResults?: Array<{ status: string }>;
      error?: Error;
    }> = [];
    const stepEvents: Array<{
      type: string;
      error?: Error;
    }> = [];

    const errorWorkflow = workflow<SimpleContext>(
      'Error Workflow',
      // Step 1: Normal step
      step(
        "First step",
        action(async (context) => context.value + 1),
        reduce((newValue: number) => ({
          value: newValue,
        }))
      ),
      // Step 2: Error step
      step(
        "Error step",
        action(async () => {
          throw new Error('Test error');
        }),
        reduce((newValue: number) => ({ value: newValue })),
        on('step:error', ({ error }) => {
          stepEvents.push({ type: 'step:error', error });
        })
      ),
      // Step 3: Should never execute
      step(
        "Never reached",
        action(async (context) => context.value + 1),
        reduce((newValue: number) => ({ value: newValue }))
      ),
      // Workflow-level error handler
      on('workflow:error', ({ error, stepResults }) => {
        workflowEvents.push({
          type: 'workflow:error',
          stepResults,
          error
        });
      })
    );

    const { stepResults } = await errorWorkflow.run({ value: 0 });

    // Verify events were captured correctly
    const workflowError = workflowEvents.find(e => e.type === 'workflow:error');
    expect(workflowError?.stepResults?.[0].status).toBe('complete');
    expect(workflowError?.stepResults?.[1].status).toBe('error');
    expect(workflowError?.stepResults?.[2].status).toBe('pending');
    expect(workflowError?.error?.message).toBe('Test error');

    // Verify step error was captured
    const stepError = stepEvents.find(e => e.type === 'step:error');
    expect(stepError?.error?.message).toBe('Test error');
  });
});

describe('step creation', () => {
  it('should create a step without a reducer', () => {
    interface SimpleContext {
      value: number;
    }

    const simpleStep = step<SimpleContext, number>(
      "Simple step",
      action(async (context) => context.value),
      on('step:complete', () => {})
    );

    expect(simpleStep.reducer).toBeUndefined();
    expect(simpleStep.events).toHaveLength(1);
  });

  it('should create a step with a reducer', () => {
    interface SimpleContext {
      value: number;
    }

    const stepWithReducer = step<SimpleContext, number>(
      "Step with reducer",
      action(async (context) => context.value + 1),
      reduce((result) => ({ value: result })),
      on('step:complete', () => {})
    );

    expect(stepWithReducer.reducer).toBeDefined();
    expect(stepWithReducer.events).toHaveLength(1);
  });
});

