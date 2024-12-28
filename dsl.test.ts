import { workflow } from './dsl';

describe('workflow creation', () => {
  it('should create a workflow with a name when passed a string', () => {
    const wf = workflow('my workflow');
    expect(wf.metadata.name).toBe('my workflow');
    // Since we only passed a string, we expect no description to be set
    expect(wf.metadata.description).toBeUndefined();
  });

  it('should create a workflow with a name and description when passed an object', () => {
    const wf = workflow({ name: 'my named workflow', description: 'some description' });
    expect(wf.metadata.name).toBe('my named workflow');
    expect(wf.metadata.description).toBe('some description');
  });
});