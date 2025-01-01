import type { WorkflowEvent, Workflow } from "../dsl";
import { Database } from "sqlite3";

class SqliteAdapter {
  constructor(private db: Database) { }

  #workflowStarted(workflow: WorkflowEvent<any>) {
    this.db.run(
      `INSERT INTO workflow_runs (
        workflow_title,
        initial_context,
        current_context,
        status,
        error
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        workflow.title,
        JSON.stringify(workflow.initialContext),
        JSON.stringify(workflow.context),
        workflow.status,
        JSON.stringify(workflow.error ?? null)
      ]
    );
  }

  #workflowUpdated(workflow: WorkflowEvent<any>) {
    this.db.run(
      `UPDATE workflow_runs SET
        current_context = ?,
        status = ?,
        error = ?
      WHERE workflow_title = ?`,
      [
        JSON.stringify(workflow.context),
        workflow.status,
        JSON.stringify(workflow.error ?? null),
        workflow.title
      ]
    );
  }

  attach(workflow: Workflow<any>) {
    workflow.on('workflow:start', async (event) => {
      console.log('workflow start', event.context);
    })
    workflow.on('workflow:update', async (event) => {
      console.log('workflow update', event.context);
    })
  }
}

export { SqliteAdapter };