import { createWorkflow } from './dsl/new-dsl';
import { WORKFLOW_EVENTS, STATUS } from './dsl/constants';

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