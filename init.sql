-- Workflow Runs
CREATE TABLE workflow_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_name TEXT NOT NULL,
    initial_context TEXT NOT NULL,  -- JSON
    status TEXT NOT NULL,
    error TEXT,  -- JSON
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    -- Add JSON validation checks
    CONSTRAINT valid_initial_context CHECK (json_valid(initial_context)),
    CONSTRAINT valid_error CHECK (error IS NULL OR json_valid(error))
);

CREATE TRIGGER workflow_runs_status_check
AFTER INSERT ON workflow_runs
WHEN NEW.status NOT IN ('pending', 'running', 'complete', 'error')
BEGIN
    SELECT RAISE(ROLLBACK, 'Invalid status value');
END;

CREATE TABLE workflow_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_run_id INTEGER NOT NULL REFERENCES workflow_runs(id),
    previous_context TEXT NOT NULL,  -- JSON
    new_context TEXT NOT NULL,  -- JSON
    status TEXT NOT NULL,
    error TEXT,  -- JSON
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    -- Add JSON validation checks
    CONSTRAINT valid_previous_context CHECK (json_valid(previous_context)),
    CONSTRAINT valid_new_context CHECK (json_valid(new_context)),
    CONSTRAINT valid_error CHECK (error IS NULL OR json_valid(error))
);

-- Add check constraint separately for better compatibility
CREATE TRIGGER workflow_steps_status_check
AFTER INSERT ON workflow_steps
WHEN NEW.status NOT IN ('pending', 'running', 'complete', 'error')
BEGIN
    SELECT RAISE(ROLLBACK, 'Invalid status value');
END;

CREATE INDEX workflow_steps_workflow_run_id_idx ON workflow_steps(workflow_run_id);