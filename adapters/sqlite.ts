import { Database } from "sqlite3";
import { Adapter } from "./adapter";
import { step, type Event } from "../dsl";

class SqliteAdapter extends Adapter {
  constructor(
    private db: Database,
    private workflowRunId?: number
  ) {
    super();
  }

  async restarted(workflow: Event<any, any>) {
    this.workflowRunId = undefined;
  }

  async started(workflow: Event<any, any>) {
    const createWorkflowRun = new Promise<number>((resolve, reject) => {
      const { workflowName, previousContext, status, error } = workflow;

      this.db.run(
        `INSERT INTO workflow_runs (
          workflow_name,
          initial_context,
          status,
          error
        ) VALUES (?, ?, ?, ?)`,
        [
          workflowName,
          JSON.stringify(previousContext),
          status,
          error ? JSON.stringify(error) : null
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

  async updated(event: Event<any, any>) {
    if (!this.workflowRunId) {
      throw new Error('Workflow run ID is required for this event handler in the SQLite adapter');
    }

    await Promise.all([
      // Update workflow status
      new Promise<void>((resolve, reject) => {
        this.db.run(
          `UPDATE workflow_runs SET
            status = ?,
            error = ?
          WHERE id = ?`,
          [
            event.status,
            event.error ? JSON.stringify(event.error) : null,
            this.workflowRunId
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      }),

      // Insert step completion record
      new Promise<void>((resolve, reject) => {
        this.db.run(
          `INSERT INTO workflow_steps (
            workflow_run_id,
            previous_context,
            new_context,
            status,
            error
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            this.workflowRunId,
            JSON.stringify(event.previousContext),
            JSON.stringify(event.newContext),
            'complete',
            event.error ? JSON.stringify(event.error) : null
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      })
    ]);
  }

  async completed(workflow: Event<any, any>) {
    if (!this.workflowRunId) {
      throw new Error('Workflow run ID is required for this event handler in the SQLite adapter');
    }

    return new Promise<void>((resolve, reject) => {
      this.db.run(
        `UPDATE workflow_runs SET
          status = 'complete',
          error = ?
        WHERE id = ?`,
        [
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

  async error(workflow: Event<any, any>) {
    if (!this.workflowRunId) {
      throw new Error('Workflow run ID is required for this event handler in the SQLite adapter');
    }

    await Promise.all([
      // Update workflow status
      new Promise<void>((resolve, reject) => {
        this.db.run(
          `UPDATE workflow_runs SET
            status = 'error',
            error = ?
          WHERE id = ?`,
          [
            workflow.error ? JSON.stringify(workflow.error) : null,
            this.workflowRunId
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      }),

      // Insert step error record
      new Promise<void>((resolve, reject) => {
        this.db.run(
          `INSERT INTO workflow_steps (
            workflow_run_id,
            previous_context,
            new_context,
            status,
            error
          ) VALUES (?, ?, ?, ?, ?)`,
          [
            this.workflowRunId,
            JSON.stringify(workflow.previousContext),
            JSON.stringify(workflow.newContext),
            'error',
            workflow.error ? JSON.stringify(workflow.error) : null
          ],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      })
    ]);
  }
}

export { SqliteAdapter };