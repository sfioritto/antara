import { Database } from "sqlite3";
import { Adapter } from "./adapter";
import type { WorkflowEvent } from "../dsl";

class SqliteAdapter extends Adapter {
  constructor(private db: Database) {
    super();
  }

  async started(workflow: WorkflowEvent<any>) {
    return new Promise<void>((resolve, reject) => {
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
        ],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  }

  async updated(workflow: WorkflowEvent<any>) {
    return new Promise<void>((resolve, reject) => {
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