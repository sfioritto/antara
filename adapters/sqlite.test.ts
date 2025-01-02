import { Database } from "sqlite3";
import { SqliteAdapter } from "./sqlite";
import { workflow, step, action, reduce } from "../dsl";
import { readFileSync } from "fs";
import { join } from "path";

describe("SqliteAdapter", () => {
  let db: Database;
  let adapter: SqliteAdapter;

  beforeEach((done) => {
    // Use in-memory SQLite database for testing
    db = new Database(":memory:", (err) => {
      if (err) throw err;

      // Read and execute init.sql file
      const initSql = readFileSync(join(__dirname, "../init.sql"), "utf8");
      db.exec(initSql, done);
    });

    adapter = new SqliteAdapter(db);
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

    new Promise<void>((resolve, reject) => {
      db.on('trace', (sql) => {
        if (sql.includes('INSERT INTO workflow_runs')) {
          db.get(
            "SELECT * FROM workflow_runs WHERE workflow_title = ?",
            ["Test Counter"],
            (err, row: any) => {
              if (err) {
                reject(err);
                return;
              }

              try {
                expect(row).toBeTruthy();
                expect(row.workflow_title).toBe("Test Counter");
                expect(JSON.parse(row.initial_context)).toEqual({ count: 0 });
                expect(JSON.parse(row.current_context)).toEqual({ count: 1 });
                expect(row.status).toBe("running");
                expect(row.error).toBe("null");
                resolve();
              } catch (error) {
                reject(error);
              }
            }
          );
        }
      });
    });

    // Run workflow
    for await (const event of testWorkflow.run({ count: 0 })) {
      adapter.dispatch(event);
    }
  });

  // it("should track multiple workflow executions correctly", (done) => {
  //   interface CounterContext {
  //     count: number;
  //   }

  //   interface NameContext {
  //     name: string;
  //   }

  //   const counterWorkflow = workflow<CounterContext>(
  //     "Counter Workflow",
  //     step(
  //       "Increment",
  //       action(async (context) => context.count + 1),
  //       reduce((result) => ({ count: result }))
  //     )
  //   );

  //   const nameWorkflow = workflow<NameContext>(
  //     "Name Workflow",
  //     step(
  //       "Uppercase",
  //       action(async (context) => context.name.toUpperCase()),
  //       reduce((result) => ({ name: result }))
  //     )
  //   );

  //   // Attach adapter to both workflows
  //   adapter.attach(counterWorkflow);
  //   adapter.attach(nameWorkflow);

  //   let insertCount = 0;

  //   // Set up database change listener
  //   db.on('trace', (sql) => {
  //     if (sql.includes('INSERT INTO workflow_runs')) {
  //       insertCount++;

  //       // Only verify after both inserts are complete
  //       if (insertCount === 2) {
  //         // Query the database to verify both workflows
  //         db.all(
  //           "SELECT * FROM workflow_runs ORDER BY created_at DESC LIMIT 2",
  //           [],
  //           (err, rows: any[]) => {
  //             if (err) {
  //               done(err);
  //               return;
  //             }

  //             try {
  //               expect(rows.length).toBe(2);

  //               // Verify Name Workflow
  //               const nameRow = rows.find(r => r.workflow_title === "Name Workflow");
  //               expect(nameRow).toBeTruthy();
  //               expect(JSON.parse(nameRow.initial_context)).toEqual({ name: "test" });
  //               expect(JSON.parse(nameRow.current_context)).toEqual({ name: "TEST" });
  //               expect(nameRow.status).toBe("running");
  //               expect(nameRow.error).toBe("null");

  //               // Verify Counter Workflow
  //               const counterRow = rows.find(r => r.workflow_title === "Counter Workflow");
  //               expect(counterRow).toBeTruthy();
  //               expect(JSON.parse(counterRow.initial_context)).toEqual({ count: 0 });
  //               expect(JSON.parse(counterRow.current_context)).toEqual({ count: 1 });
  //               expect(counterRow.status).toBe("running");
  //               expect(counterRow.error).toBe("null");

  //               done();
  //             } catch (error) {
  //               done(error);
  //             }
  //           }
  //         );
  //       }
  //     }
  //   });

  //   // Run both workflows
  //   Promise.all([
  //     counterWorkflow.run({ count: 0 }),
  //     nameWorkflow.run({ name: "test" })
  //   ]).catch(done);
  // });
});