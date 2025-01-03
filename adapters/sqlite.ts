import { Database } from "sqlite3";
import { Adapter } from "./adapter";
import type { Event, WorkflowEvent } from "../dsl";

class SqliteAdapter extends Adapter {
  constructor(
    private db: Database,
    public workflowRunId?: number,
  ) {
    super();
  }

  async stepComplete(step: Event<any>) {
    return new Promise<void>((resolve, reject) => {
      this.db.run(
        `INSERT INTO workflow_steps (
          workflow_run_id,
          title,
          initial_context,
          context,
          status,
          error
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          this.workflowRunId,
          step.title,
          JSON.stringify(step.initialContext),
          JSON.stringify(step.context),
          'complete',
          step.error ? JSON.stringify(step.error) : null
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async stepError(step: Event<any>) {
    return new Promise<void>((resolve, reject) => {
      this.db.run(
        `INSERT INTO workflow_steps (
          workflow_run_id,
          title,
          initial_context,
          context,
          status,
          error
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          this.workflowRunId,
          step.title,
          JSON.stringify(step.initialContext),
          JSON.stringify(step.context),
          'error',
          JSON.stringify(step.error)
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async started(workflow: WorkflowEvent<any>) {
    if (this.workflowRunId) {
      throw new Error('Workflow run ID is already set');
    }

    const createWorkflowRun = new Promise<number>((resolve, reject) => {
      this.db.run(
        `INSERT INTO workflow_runs (
          workflow_title,
          initial_context,
          context,
          status,
          error
        ) VALUES (?, ?, ?, ?, ?)`,
        [
          workflow.title,
          JSON.stringify(workflow.initialContext),
          JSON.stringify(workflow.context),
          workflow.status,
          workflow.error ? JSON.stringify(workflow.error) : null
        ],
        function(err) {
          if (err) reject(err);
          else {
            resolve(this.lastID);
          }
        }
      );
    });

    return createWorkflowRun.then((workflowRunId) => {
      this.workflowRunId = workflowRunId;
    });
  }

  async updated(workflow: WorkflowEvent<any>) {
    return new Promise<void>((resolve, reject) => {
      this.db.run(
        `UPDATE workflow_runs SET
          context = ?,
          status = ?,
          error = ?
        WHERE id = ?`,
        [
          JSON.stringify(workflow.context),
          workflow.status,
          workflow.error ? JSON.stringify(workflow.error) : null,
          this.workflowRunId
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async completed(workflow: WorkflowEvent<any>) {
    return new Promise<void>((resolve, reject) => {
      this.db.run(
        `UPDATE workflow_runs SET
          context = ?,
          status = 'complete',
          error = ?
        WHERE id = ?`,
        [
          JSON.stringify(workflow.context),
          workflow.error ? JSON.stringify(workflow.error) : null,
          this.workflowRunId
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async error(workflow: WorkflowEvent<any>) {
    return new Promise<void>((resolve, reject) => {
      this.db.run(
        `UPDATE workflow_runs SET
          context = ?,
          status = 'error',
          error = ?
        WHERE id = ?`,
        [
          JSON.stringify(workflow.context),
          workflow.error ? JSON.stringify(workflow.error) : null,
          this.workflowRunId
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }
}

export { SqliteAdapter };