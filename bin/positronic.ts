#!/usr/bin/env NODE_NO_WARNINGS=1 node --loader ts-node/esm --experimental-specifier-resolution=node

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { SQLiteAdapter } from '../adapters/sqlite';
import { WorkflowRunner } from '../workflow-runner';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

interface CliOptions {
  workflowDir?: string;
  contextFile?: string;
}

function parseArgs(): CliOptions & { workflowPath: string } {
  const args = process.argv.slice(2);
  const options: CliOptions = {};
  const nonOptionArgs: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const [key, value] = arg.slice(2).split('=');
      switch (key) {
        case 'workflow-dir':
          options.workflowDir = value;
          break;
        case 'context':
          options.contextFile = value;
          break;
      }
    } else {
      nonOptionArgs.push(arg);
    }
  }

  if (nonOptionArgs.length === 0) {
    throw new Error('Please provide a workflow file path');
  }

  return { ...options, workflowPath: nonOptionArgs[0] };
}

async function loadContext(contextFile?: string) {
  if (!contextFile) return {};

  const fullPath = path.resolve(process.cwd(), contextFile);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Context file not found: ${contextFile}`);
  }

  const content = fs.readFileSync(fullPath, 'utf-8');
  return JSON.parse(content);
}

async function loadTypeScriptWorkflow(filePath: string) {
  try {
    const importedModule = await import(path.resolve(filePath));
    return importedModule.default;
  } catch (error) {
    console.error('Failed to load TypeScript workflow:', error);
    throw error;
  }
}

async function initializeDatabase(dbPath: string) {
  const db = new Database(dbPath);

  // Check if tables exist
  const tableExists = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type='table' AND name='workflow_runs'
  `).get();

  if (!tableExists) {
    // Get the current file's path and construct the path to init.sql
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFilePath);
    const initSql = fs.readFileSync(path.join(currentDir, '../init.sql'), 'utf8');
    db.exec(initSql);
  }

  return db;
}

async function main() {
  try {
    const { workflowPath, workflowDir, contextFile } = parseArgs();

    const fullPath = workflowDir
      ? path.resolve(process.cwd(), workflowDir, workflowPath)
      : path.resolve(process.cwd(), workflowPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Workflow file not found: ${fullPath}. CWD: ${process.cwd()}`);
    }

    const workflow = await loadTypeScriptWorkflow(fullPath);

    if (!workflow || workflow.type !== 'workflow') {
      throw new Error(`File ${workflowPath} does not export a workflow as default export`);
    }

    const initialContext = await loadContext(contextFile);

    const db = await initializeDatabase('workflows.db');
    const runner = new WorkflowRunner<any>([
      new SQLiteAdapter(db),
    ]);

    await runner.run(workflow, initialContext);

  } catch (error) {
    if (error instanceof Error) {
      console.error('Failed to run workflow:', error.message);
      if (error.stack) console.error(error.stack);
    }
    process.exit(1);
  }
}

main();