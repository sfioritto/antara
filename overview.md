# Positronic Project Architecture Guide

## 1. Project Creation & Setup

    npx create-positronic-project my-workflow
    cd my-workflow
    npm install

Creates a project with:

- /workflows, /adapters, /templates, /lib directories
- SQLite database setup
- Pre-configured environment
- Example workflows and templates

## 2. Development Experience

    npm run dev

This:

- Starts the React Router 7 webapp (on e.g. 3000)
- Initializes SQLite database
- Hot reloads workflow definitions

## 3. The Core Components

### a) Workflow Definition (user writes these)

    // /workflows/registration.ts
    const registrationFlow = workflow<RegistrationState>(
        step("Validate", action(...), reduce(...)),
        step("Create Account", action(...), reduce(...)),
        on('workflow:complete', async ({state}) => {
            // Do something when workflow completes
        })
    )

### b) Data Flow

- Webapp discovers and imports workflow definitions
- Workflow runs are stored in SQLite (states, statuses, etc.)
- SQLite acts as the communication layer between CLI and webapp
- Real-time updates via SQLite change notifications

### c) Interfaces

- Web UI: React Router 7 app for viewing/running workflows
- CLI: For running workflows from command line
- Both interfaces share the same SQLite database

## 4. User Interaction Points

- Define workflows in code using the DSL
- Run workflows via web UI or CLI
- Monitor progress in real-time through web UI
- Customize via templates or custom adapters

**Key Insight**: SQLite acts as both the persistence layer and the communication mechanism between all components, while the workflow DSL provides the core abstraction for defining business logic.
