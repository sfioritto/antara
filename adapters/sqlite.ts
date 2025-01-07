import { Database } from "sqlite3";
import { Adapter } from "./adapter";
import { STATUS } from "../dsl";
import type { Event } from "../dsl";

interface SqliteOptions {
  workflowRunId?: number;
}

class SqliteAdapter extends Adapter<SqliteOptions> {
  constructor(
    private db: Database,
    private workflowRunId?: number
  ) {
    super();
  }

  async restarted(event: Event<any, SqliteOptions>) {
    this.workflowRunId = event.options?.workflowRunId;
    const { steps = [] } = event;

    if (!this.workflowRunId) {
      await this.started(event);
    } else {
      const completedSteps = steps.filter((step) => step.status === STATUS.COMPLETE);

      await Promise.all([
        // Update workflow run status to running
        new Promise<void>((resolve, reject) => {
          this.db.run(
            `UPDATE workflow_runs SET
              status = 'running',
              error = NULL
            WHERE id = ?`,
            [this.workflowRunId],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        }),

        // Delete all steps after keeping the first N completed ones
        new Promise<void>((resolve, reject) => {
          this.db.run(
            `DELETE FROM workflow_steps
             WHERE workflow_run_id = ?
             AND id NOT IN (
               SELECT id FROM workflow_steps
               WHERE workflow_run_id = ?
               ORDER BY id ASC
               LIMIT ?
             )`,
            [this.workflowRunId, this.workflowRunId, completedSteps.length],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        })
      ]);
    }
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