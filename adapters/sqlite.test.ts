import { Database } from "sqlite3";
import { SqliteAdapter } from "./sqlite";
import { workflow, step, action, reduce } from "../dsl";
import { readFileSync } from "fs";
import { join } from "path";
import { runWorkflow, runWorkflowStepByStep } from "./test-helpers";

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
    expect(JSON.parse(workflowRun.context)).toEqual({ count: 1 });
    expect(workflowRun.status).toBe("complete");
    expect(workflowRun.error).toBe(null);

    // Add verification of workflow steps
    const steps = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM workflow_steps WHERE workflow_run_id = ? ORDER BY created_at ASC",
        [workflowRun.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].title).toBe("Increment");
    expect(JSON.parse(steps[0].initial_context)).toEqual({ count: 0 });
    expect(JSON.parse(steps[0].context)).toEqual({ count: 1 });
    expect(steps[0].status).toBe("complete");
    expect(steps[0].error).toBe(null);
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
    expect(JSON.parse(workflowRuns[0].context)).toEqual({ count: 1 });
    expect(workflowRuns[0].status).toBe("complete");
    expect(workflowRuns[0].error).toBe(null);

    // Verify Name Workflow
    expect(workflowRuns[1].workflow_title).toBe("Name Workflow");
    expect(JSON.parse(workflowRuns[1].initial_context)).toEqual({ name: "test" });
    expect(JSON.parse(workflowRuns[1].context)).toEqual({ name: "TEST" });
    expect(workflowRuns[1].status).toBe("complete");
    expect(workflowRuns[1].error).toBe(null);

    // Add verification of workflow steps for both workflows
    const allSteps = await new Promise<any[]>((resolve, reject) => {
      db.all(
        `SELECT s.*
         FROM workflow_steps s
         JOIN workflow_runs r ON s.workflow_run_id = r.id
         ORDER BY r.created_at ASC, s.created_at ASC`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    expect(allSteps).toHaveLength(2);

    // Verify Counter Workflow Step
    expect(allSteps[0].title).toBe("Increment");
    expect(JSON.parse(allSteps[0].initial_context)).toEqual({ count: 0 });
    expect(JSON.parse(allSteps[0].context)).toEqual({ count: 1 });
    expect(allSteps[0].status).toBe("complete");
    expect(allSteps[0].error).toBe(null);

    // Verify Name Workflow Step
    expect(allSteps[1].title).toBe("Uppercase");
    expect(JSON.parse(allSteps[1].initial_context)).toEqual({ name: "test" });
    expect(JSON.parse(allSteps[1].context)).toEqual({ name: "TEST" });
    expect(allSteps[1].status).toBe("complete");
    expect(allSteps[1].error).toBe(null);
  });

  it("should track workflow step errors correctly", async () => {
    interface ErrorContext {
      shouldError: boolean;
    }

    const errorWorkflow = workflow<ErrorContext>(
      "Error Workflow",
      step(
        "Maybe Error",
        action(async (context) => {
          if (context.shouldError) {
            throw new Error("Test error");
          }
          return context;
        })
      )
    );

    // Run workflow that will error
    await runWorkflow(errorWorkflow, { shouldError: true }, [new SqliteAdapter(db)]);

    // Query workflow run and its steps
    const workflowRun = await new Promise<any>((resolve, reject) => {
      db.get(
        "SELECT * FROM workflow_runs WHERE workflow_title = ?",
        ["Error Workflow"],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    // Add assertions for workflow run
    expect(workflowRun.status).toBe("error");
    expect(JSON.parse(workflowRun.error)).toMatchObject({
      name: "Error",
      message: "Test error"
    });

    const steps = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM workflow_steps WHERE workflow_run_id = ?",
        [workflowRun.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    expect(steps).toHaveLength(1);
    expect(steps[0].title).toBe("Maybe Error");
    expect(JSON.parse(steps[0].initial_context)).toEqual({ shouldError: true });
    expect(steps[0].status).toBe("error");
    expect(JSON.parse(steps[0].error)).toMatchObject({
      name: "Error",
      message: "Test error"
    });
  });

  it("should track multi-step workflow execution step by step", async () => {
    interface MultiStepContext {
      value: string;
      count: number;
    }

    const multiStepWorkflow = workflow<MultiStepContext>(
      "Multi Step Workflow",
      step(
        "Uppercase String",
        action(async (context) => context.value.toUpperCase()),
        reduce((result, context) => ({ ...context, value: result }))
      ),
      step(
        "Increment Counter",
        action(async (context) => context.count + 1),
        reduce((result, context) => ({ ...context, count: result }))
      )
    );

    const adapter = new SqliteAdapter(db);
    const stepIterator = runWorkflowStepByStep(
      multiStepWorkflow,
      { value: "test", count: 0 },
      [adapter]
    );

    // Run first step
    await stepIterator.next(); // START event
    await stepIterator.next(); // STEP COMPLETE event
    await stepIterator.next(); // UPDATE event

    // Verify workflow state after first step
    const firstStepRun = await new Promise<any>((resolve, reject) => {
      db.get(
        "SELECT * FROM workflow_runs WHERE workflow_title = ?",
        ["Multi Step Workflow"],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    expect(firstStepRun.status).toBe("running");
    expect(JSON.parse(firstStepRun.context)).toEqual({ value: "TEST", count: 0 });

    // Verify first step row
    const firstStepRows = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM workflow_steps WHERE workflow_run_id = ? ORDER BY created_at ASC",
        [firstStepRun.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    expect(firstStepRows).toHaveLength(1);
    expect(firstStepRows[0].title).toBe("Uppercase String");
    expect(JSON.parse(firstStepRows[0].initial_context)).toEqual({ value: "test", count: 0 });
    expect(JSON.parse(firstStepRows[0].context)).toEqual({ value: "TEST", count: 0 });
    expect(firstStepRows[0].status).toBe("complete");

    // Run second step
    await stepIterator.next(); // STEP COMPLETE event
    await stepIterator.next(); // UPDATE event

    // Verify steps after second step completes
    const secondStepRows = await new Promise<any[]>((resolve, reject) => {
      db.all(
        "SELECT * FROM workflow_steps WHERE workflow_run_id = ? ORDER BY created_at ASC",
        [firstStepRun.id],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });

    expect(secondStepRows).toHaveLength(2);
    expect(secondStepRows[1].title).toBe("Increment Counter");
    expect(JSON.parse(secondStepRows[1].initial_context)).toEqual({ value: "TEST", count: 0 });
    expect(JSON.parse(secondStepRows[1].context)).toEqual({ value: "TEST", count: 1 });
    expect(secondStepRows[1].status).toBe("complete");

    // Complete workflow
    await stepIterator.next(); // COMPLETE event

    // Verify final state
    const finalRun = await new Promise<any>((resolve, reject) => {
      db.get(
        "SELECT * FROM workflow_runs WHERE workflow_title = ?",
        ["Multi Step Workflow"],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    expect(finalRun.status).toBe("complete");
    expect(JSON.parse(finalRun.context)).toEqual({ value: "TEST", count: 1 });
  });

  it("should throw error when starting workflow with existing run ID", async () => {
    interface TestContext {
      value: string;
    }

    const testWorkflow = workflow<TestContext>(
      "Test Workflow",
      step(
        "Test Step",
        action(async (context) => context.value)
      )
    );

    const adapter = new SqliteAdapter(db);

    // Manually set the workflowRunId
    (adapter as any).workflowRunId = 123;

    // Attempt to run workflow should throw
    await expect(
      runWorkflow(testWorkflow, { value: "test" }, [adapter])
    ).rejects.toThrow("Workflow run ID is already set");
  });
});