import { JsonObject } from 'type-fest';
import { workflow, on, step, action, reduce } from './dsl';


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
  it('should fire workflow events in correct order with proper state/status', async () => {
    interface SimpleState extends JsonObject {
      value: number;
    }

    const workflowEventLog: string[] = [];

    const simpleWorkflow = workflow<SimpleState>(
      'Simple Workflow',
      step(
        "Increment step",
        action(async (state: SimpleState) => state.value + 1),
        reduce((newValue: number, state: SimpleState) => ({
          value: newValue
        }))
      ),
      // Workflow-level events
      on('workflow:start', ({ statuses, state }) => {
        workflowEventLog.push('workflow:start');
        expect(statuses[0].status).toBe('pending');
        expect(state.value).toBe(0);
      }),
      on('workflow:update', ({ status, state }) => {
        workflowEventLog.push('workflow:update');
        expect(status?.status).toBe('running');
        expect(state.value).toBe(0); // State hasn't been updated yet
      }),
      on('workflow:complete', ({ statuses, state }) => {
        workflowEventLog.push('workflow:complete');
        expect(statuses[0].status).toBe('complete');
        expect(state.value).toBe(1);
      })
    );

    const { state, status } = await simpleWorkflow.run({ value: 0 });

    // Verify final state and status
    expect(state.value).toBe(1);
    expect(status[0].status).toBe('complete');
    expect(status.length).toBe(1);

    // Verify events fired in correct order
    expect(workflowEventLog).toEqual([
      'workflow:start',
      'workflow:update',
      'workflow:complete'
    ]);
  });
});