import { workflow, on, step, action, reduce } from './dsl';
import { finalWorkflowEvent } from './adapters/test-helpers';
import type { Event } from './dsl';
describe('workflow creation', () => {
  it('should create a workflow with a name when passed a string', () => {
    const wf = workflow('my workflow');
    expect(wf.name).toBe('my workflow');
    // Since we only passed a string, we expect no description to be set
    expect(wf.description).toBeUndefined();
  });

  it('should create a workflow with a name and description when passed an object', () => {
    const wf = workflow({ name: 'my named workflow', description: 'some description' });
    expect(wf.name).toBe('my named workflow');
    expect(wf.description).toBe('some description');
  });
});

describe('workflow level event listeners', () => {
  it('should fire workflow events in correct order with proper context/status', async () => {
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
        action(async (context) => context.value + 1),
        reduce((newValue) => ({
          value: newValue,
        })),
        on('step:complete', ({ type }) => {
          stepEvents.push({ type });
        })
      ),
      on('workflow:start', ({ type, status, newContext }) => {
        workflowEvents.push({ type, status, context: newContext });
      }),
      on('workflow:update', ({ type, status, newContext }) => {
        workflowEvents.push({ type, status, context: newContext });
      }),
      on('workflow:complete', ({ type, status, newContext }) => {
        workflowEvents.push({ type, status, context: newContext });
      })
    );

    const { newContext, status } = await finalWorkflowEvent(simpleWorkflow.run({ initialContext: { value: 0 } }));

    // Verify final context
    expect(newContext.value).toBe(1);
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

  it('should maintain immutable steps across workflow events', async () => {
    interface SimpleContext {
      value: number;
    }

    const workflowWithMutatingHandlers = workflow<SimpleContext>(
      'Immutable Steps Workflow',
      step(
        "Step 1",
        action(async (context) => context.value + 1),
        reduce((newValue) => ({ value: newValue }))
      ),
      step(
        "Step 2",
        action(async (context) => context.value * 2),
        reduce((newValue) => ({ value: newValue }))
      ),
      on('workflow:update', ({ steps }) => {
        // Try to modify the steps
        if (steps) {
          steps[0].status = 'pending';
          steps[0].context = { value: 999 };
        }
      })
    );

    const { steps } = await finalWorkflowEvent(
      workflowWithMutatingHandlers.run({ initialContext: { value: 1 } })
    ) as Event<SimpleContext>;

    // Verify that modifications in event handlers didn't persist
    expect(steps).toHaveLength(2);

    if (!steps) {
      throw new Error('Steps not found');
    }

    // After first step
    const [firstStepResult, secondStepResult] = steps;
    expect(firstStepResult.status).toEqual('complete');
    expect(firstStepResult.context.value).toEqual(2);

    // After second step
    expect(secondStepResult.status).toEqual('complete');
    expect(secondStepResult.context.value).toEqual(4);
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
    }> = [];

    const twoStepWorkflow = workflow<SimpleContext>(
      'Two Step Workflow',
      step(
        "Double step",
        action(async (context) => context.value * 2),
        reduce((newValue) => ({
          value: newValue
        })),
        on('step:complete', ({ newContext, type }) => {
          stepEvents.push({
            step: 'double',
            type,
            context: newContext,
          });
        })
      ),
      step(
        "Add one step",
        action(async (context) => context.value + 1),
        reduce((newValue) => ({
          value: newValue
        })),
        on('step:complete', ({ newContext, type }) => {
          stepEvents.push({
            step: 'add-one',
            type,
            context: newContext,
          });
        })
      )
    );

    const { newContext, status } = await finalWorkflowEvent(twoStepWorkflow.run({ initialContext: { value: 1 } }));

    // Verify final context
    expect(newContext.value).toBe(3);
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
      steps: Array<{ status: string }>;
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
        reduce((newValue) => ({
          value: newValue,
        }))
      ),
      // Step 2: Error step
      step(
        "Error step",
        action(async () => {
          throw new Error('Test error');
        }),
        reduce((newValue) => ({ value: newValue })),
        on('step:error', ({ error, type }) => {
          stepEvents.push({ type, error });
        })
      ),
      // Step 3: Should never execute
      step(
        "Never reached",
        action(async (context) => context.value + 1),
        reduce((newValue) => ({ value: newValue }))
      ),
      // Workflow-level error handler
      on('workflow:error', ({ error, steps, type }) => {
        if (steps) {
          workflowEvents.push({
            type,
            steps,
            error
          });
        }
      })
    );

    await finalWorkflowEvent(errorWorkflow.run({ initialContext: { value: 0 } }));

    // Verify events were captured correctly
    const workflowError = workflowEvents.find(e => e.type === 'workflow:error');
    if (!workflowError) {
      throw new Error('Workflow error not found');
    }
    expect(workflowError.steps[0].status).toBe('complete');
    expect(workflowError.steps[1].status).toBe('error');
    expect(workflowError.steps[2].status).toBe('pending');
    expect(workflowError.error?.message).toBe('Test error');

    // Verify step error was captured
    const stepError = stepEvents.find(e => e.type === 'step:error');
    if (!stepError) {
      throw new Error('Step error not found');
    }
    expect(stepError.error?.message).toBe('Test error');
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

    expect(simpleStep.blocks).toHaveLength(2);
    expect(simpleStep.blocks.map(({ type }) => type)).toEqual(['action', 'event']);
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

    expect(stepWithReducer.blocks).toHaveLength(3);
    expect(stepWithReducer.blocks.map(({ type }) => type)).toEqual(['action', 'reducer', 'event']);
  });

  it('should not modify the original context when action or reducer mutates context', async () => {
    interface SimpleContext {
      value: number;
      nested: { count: number };
    }

    const originalContext: SimpleContext = {
      value: 1,
      nested: { count: 0 }
    };

    // Step with action that tries to modify context directly
    const mutatingActionStep = step<SimpleContext, void>(
      "Mutating action step",
      action(async (context) => {
        context.value = 99;
        context.nested.count = 99;
      })
    );

    // Step with reducer that returns modified context
    const mutatingReducerStep = step<SimpleContext, number>(
      "Mutating reducer step",
      action(async () => 42),
      reduce((_, context) => {
        context.value = 100;
        context.nested.count = 100;
        return context;
      })
    );

    await mutatingActionStep.run(originalContext);
    await mutatingReducerStep.run(originalContext);

    // Verify original context remains unchanged
    expect(originalContext).toEqual({
      value: 1,
      nested: { count: 0 }
    });
  });

  it('should maintain immutable results during step events', async () => {
    interface SimpleContext {
      value: number;
    }

    const stepWithMutatingHandler = step<SimpleContext, { returnedValue: number }>(
      "Immutable Results Step",
      action(async (context) => ({ returnedValue: context.value + 1 })),
      reduce(({ returnedValue }) => ({ value: returnedValue })),
      on('step:complete', (event) => {
        event.newContext.value = 999;
      })
    );

    const { status, context } = await stepWithMutatingHandler.run({ value: 1 });

    // Verify that modifications in event handlers didn't persist
    expect(status).toEqual('complete');
    expect(context.value).toEqual(2);
  });
});

describe('workflow resumption', () => {
  it('should resume workflow from a specific step with correct context chain', async () => {
    interface SimpleContext {
      value: number;
    }

    const stepResults: Array<{ step: string; value: number }> = [];

    const threeStepWorkflow = workflow<SimpleContext>(
      'Three Step Workflow',
      step(
        "Step 1: Double",
        action((context) => context.value * 2),
        reduce((newValue) => ({ value: newValue })),
        on('step:complete', ({ newContext }) => {
          stepResults.push({ step: 'double', value: newContext.value });
        })
      ),
      step(
        "Step 2: Add 10",
        action(async (context) => context.value + 10),
        reduce((newValue) => ({ value: newValue })),
        on('step:complete', ({ newContext }) => {
          stepResults.push({ step: 'add-10', value: newContext.value });
        })
      ),
      step(
        "Step 3: Multiply by 3",
        action(async (context) => context.value * 3),
        reduce((newValue) => ({ value: newValue })),
        on('step:complete', ({ newContext }) => {
          stepResults.push({ step: 'multiply-3', value: newContext.value });
        })
      )
    );

    const initialContext = { value: 2 };

    // First run the workflow normally
    const fullRun = await finalWorkflowEvent(threeStepWorkflow.run({ initialContext }));

    // Clear step results for next run
    stepResults.length = 0;

    if (!fullRun.steps) {
      throw new Error('Steps not found');
    }

    // Resume from step 2 by passing the completed first step
    const resumedRun = await finalWorkflowEvent(
      threeStepWorkflow.run({ initialContext, initialCompletedSteps: [fullRun.steps[0]] })
    );

    // Verify the full run executed correctly
    expect(fullRun.newContext.value).toBe(42); // ((2 * 2) + 10) * 3 = 42
    expect(fullRun.steps.map(s => s.context.value)).toEqual([4, 14, 42]);

    // Verify the resumed run started from step 2 with correct context
    expect(resumedRun.newContext.value).toBe(42);
    expect(stepResults).toHaveLength(2); // Only steps 2 and 3 should have run
    expect(stepResults).toEqual([
      { step: 'add-10', value: 14 },
      { step: 'multiply-3', value: 42 }
    ]);
  });
});

