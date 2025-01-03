import { Database } from "sqlite3";
import { SqliteAdapter } from "./sqlite";
import { workflow, step, action, reduce } from "../dsl";
import { readFileSync } from "fs";
import { join } from "path";
import { runWorkflow } from "./test-helpers";

describe("SqliteAdapter", () => {
  let db: Database;

  beforeEach((done) => {
    // Use in-memory SQLite database for testing
    db = new Database(":memory:", (err) => {
      if (err) throw err;

      // Read and execute init.sql file
      const initSql = readFileSync(join(__dirname, "../init.sql"), "utf8");
      db.exec(initSql, done);
    });
  });

  afterEach((done) => {
    db.close(done);
  });

  it("should track workflow execution in database", async () => {
    interface TestContext {
      count: number;
    }

    const testWorkflow = workflow<TestContext>(
      "Test Counter",
      step(
        "Increment",
        action(async (context) => context.count + 1),
        reduce((result) => ({ count: result }))
      )
    );

    // Run workflow
    await runWorkflow(testWorkflow, { count: 0 }, [new SqliteAdapter(db)]);

    // Query and verify workflow run
    const workflowRun = await new Promise<any>((resolve, reject) => {
      db.get(
        "SELECT * FROM workflow_runs WHERE workflow_title = ?",
        ["Test Counter"],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    expect(workflowRun).toBeTruthy();
    expect(workflowRun.workflow_title).toBe("Test Counter");
    expect(JSON.parse(workflowRun.initial_context)).toEqual({ count: 0 });
    expect(JSON.parse(workflowRun.current_context)).toEqual({ count: 1 });
    expect(workflowRun.status).toBe("complete");
    expect(workflowRun.error).toBe(null);
  });

  it("should track multiple workflow executions correctly", async () => {
    interface CounterContext {
      count: number;
    }

    interface NameContext {
      name: string;
    }

    const counterWorkflow = workflow<CounterContext>(
      "Counter Workflow",
      step(
        "Increment",
        action(async (context) => context.count + 1),
        reduce((result) => ({ count: result }))
      )
    );

    const nameWorkflow = workflow<NameContext>(
      "Name Workflow",
      step(
        "Uppercase",
        action(async (context) => context.name.toUpperCase()),
        reduce((result) => ({ name: result }))
      )
    );

    // Run both workflows
    await runWorkflow(counterWorkflow, { count: 0 }, [new SqliteAdapter(db)]);
    await runWorkflow(nameWorkflow, { name: "test" }, [new SqliteAdapter(db)]);

    // Query and verify workflow runs
    const workflowRuns = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM workflow_runs ORDER BY created_at ASC",
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    // Verify Counter Workflow
    expect(workflowRuns[0].workflow_title).toBe("Counter Workflow");
    expect(JSON.parse(workflowRuns[0].initial_context)).toEqual({ count: 0 });
    expect(JSON.parse(workflowRuns[0].current_context)).toEqual({ count: 1 });
    expect(workflowRuns[0].status).toBe("complete");
    expect(workflowRuns[0].error).toBe(null);

    // Verify Name Workflow
    expect(workflowRuns[1].workflow_title).toBe("Name Workflow");
    expect(JSON.parse(workflowRuns[1].initial_context)).toEqual({ name: "test" });
    expect(JSON.parse(workflowRuns[1].current_context)).toEqual({ name: "TEST" });
    expect(workflowRuns[1].status).toBe("complete");
    expect(workflowRuns[1].error).toBe(null);
  });
});