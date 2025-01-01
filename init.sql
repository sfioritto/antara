-- Workflow Runs
CREATE TABLE workflow_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_title TEXT NOT NULL,
    initial_context JSONB NOT NULL,
    final_context JSONB,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'complete', 'error')),
    error JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE workflow_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_run_id UUID NOT NULL REFERENCES workflow_runs(id),
    title TEXT NOT NULL,
    initial_context JSONB NOT NULL,
    final_context JSONB,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'complete', 'error')),
    error JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX workflow_steps_workflow_run_id_idx ON workflow_steps(workflow_run_id);