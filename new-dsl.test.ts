import { createWorkflow } from './dsl/new-dsl';
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
    expect(startResult.value).toBeDefined();
    expect(startResult.value?.type).toBe(WORKFLOW_EVENTS.START);
    expect(startResult.value?.status).toBe(STATUS.RUNNING);
    expect(startResult.value?.workflowName).toBe('test workflow');

    // Check first step completion
    const firstStepResult = await workflowRun.next();
    expect(firstStepResult.value?.type).toBe(WORKFLOW_EVENTS.UPDATE);
    expect(firstStepResult.value?.status).toBe(STATUS.RUNNING);
    expect(firstStepResult.value?.newContext).toEqual({ count: 1 });

    // Check second step completion
    const secondStepResult = await workflowRun.next();
    expect(secondStepResult.value?.type).toBe(WORKFLOW_EVENTS.UPDATE);
    expect(secondStepResult.value?.status).toBe(STATUS.RUNNING);
    expect(secondStepResult.value?.newContext).toEqual({ count: 1, doubled: 2 });

    // Check workflow completion
    const completeResult = await workflowRun.next();
    expect(completeResult.value?.type).toBe(WORKFLOW_EVENTS.COMPLETE);
    expect(completeResult.value?.status).toBe(STATUS.COMPLETE);
    expect(completeResult.value?.newContext).toEqual({ count: 1, doubled: 2 });
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
    expect(startResult.value?.type).toBe(WORKFLOW_EVENTS.START);
    expect(startResult.value?.status).toBe(STATUS.RUNNING);

    // Check first step completion
    const firstStepResult = await workflowRun.next();
    expect(firstStepResult.value?.type).toBe(WORKFLOW_EVENTS.UPDATE);
    expect(firstStepResult.value?.status).toBe(STATUS.RUNNING);
    expect(firstStepResult.value?.newContext).toEqual({ value: 1 });

    // Check error step
    const errorResult = await workflowRun.next();
    expect(errorResult.value?.type).toBe(WORKFLOW_EVENTS.ERROR);
    expect(errorResult.value?.status).toBe(STATUS.ERROR);
    expect(errorResult.value?.error?.message).toBe('Test error');
    expect(errorResult.value?.newContext).toEqual({ value: 1 }); // Context should be preserved from previous step

    // Verify steps array in error event
    expect(errorResult.value?.steps).toBeDefined();
    if (!errorResult.value?.steps) throw new Error('Steps not found');

    expect(errorResult.value.steps[0].status).toBe(STATUS.COMPLETE);
    expect(errorResult.value.steps[1].status).toBe(STATUS.ERROR);
    expect(errorResult.value.steps[2].status).toBe(STATUS.PENDING);

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
    await workflowRun.next();

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

    // Verify that modifications didn't persist
    expect(secondStepResult.value?.steps[0].status).toBe(STATUS.COMPLETE);
    expect((secondStepResult.value?.steps[0].context as SimpleContext).value).toBe(2);

    // Verify second step executed correctly
    expect(secondStepResult.value?.steps[1].status).toBe(STATUS.COMPLETE);
    expect((secondStepResult.value?.steps[1].context as SimpleContext).value).toBe(4);

    // Verify final state
    const finalResult = await workflowRun.next();
    expect(finalResult.value?.type).toBe(WORKFLOW_EVENTS.COMPLETE);
    expect(finalResult.value?.status).toBe(STATUS.COMPLETE);
    expect((finalResult.value?.newContext as SimpleContext).value).toBe(4);
  });
});