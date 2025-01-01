import type { WorkflowBlock } from "../dsl";

class SqliteAdapter {
  attach(workflow: WorkflowBlock<any>) {
    workflow.on('workflow:start', async (event) => {
      console.log('workflow start', event.context);
    })
    workflow.on('workflow:update', async (event) => {
      console.log('workflow update', event.context);
    })
  }
}

export { SqliteAdapter };