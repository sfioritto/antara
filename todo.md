# Positronic Architecture Components

## 1. Workflow Registration & Discovery System

- Add metadata to workflows (name, description, etc.)
- System to discover/import workflow files from /workflows directory
- Type-safe way to register expected initial state shape

## 2. SQLite Adapter Implementation

### Schema Design for:

- Workflow definitions
- Workflow runs
- Step statuses
- State snapshots

### Components:

- Adapter interface based on WorkflowEvent types
- Implementation of SQLite adapter that handles all workflow events

## 3. React Router 7 Web App

### Core Routes:

- Workflow list
- Workflow detail
- Run detail

### Features:

- Real-time updates via SQLite changes
- UI for initiating workflows with initial state
- Progress/status visualization

## 4. CLI Implementation

### Commands:

- List workflows
- Run workflows
- Show status
- Shared SQLite connection with webapp

## 5. Project Generator (create-positronic-project)

### Generated Structure:

- Directory structure (/workflows, /adapters, etc.)
- Example workflows
- Dev server setup
- SQLite initialization
- Configuration files

## 6. Development Experience

### Features:

- Hot reload system for workflow definitions
- Dev server that handles both webapp and workflow registration
- SQLite setup/migration system
