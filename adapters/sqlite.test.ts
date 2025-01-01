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

      // Enable statement tracing
      db.on('profile', () => {}); // This enables tracing

      // Read and execute init.sql file
      const initSql = readFileSync(join(__dirname, "../init.sql"), "utf8");
      db.exec(initSql, done);
    });

    adapter = new SqliteAdapter(db);
  });

  afterEach((done) => {
    db.close(done);
  });

  it("should track workflow execution in database", (done) => {
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

    // Attach adapter to workflow
    adapter.attach(testWorkflow);

    // Set up database change listener
    db.on('trace', (sql) => {
      if (sql.includes('INSERT INTO workflow_runs')) {
        // Query the database to verify the workflow was tracked
        db.get(
          "SELECT * FROM workflow_runs WHERE workflow_title = ?",
          ["Test Counter"],
          (err, row: any) => {
            if (err) {
              done(err);
              return;
            }

            try {
              expect(row).toBeTruthy();
              expect(row.workflow_title).toBe("Test Counter");
              expect(JSON.parse(row.initial_context)).toEqual({ count: 0 });
              expect(JSON.parse(row.current_context)).toEqual({ count: 1 });
              expect(row.status).toBe("running");
              expect(row.error).toBe("null");
              done();
            } catch (error) {
              done(error);
            }
          }
        );
      }
    });

    // Run workflow
    testWorkflow.run({ count: 0 }).catch(done);
  });
});