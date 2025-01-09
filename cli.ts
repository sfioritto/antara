#!/usr/bin/env node

import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';
import { WorkflowBlock } from './dsl';
import { SQLiteAdapter } from './adapters/sqlite';
import { WorkflowRunner } from './workflow-runner';

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

async function main() {
  try {
    const { workflowPath, workflowDir, contextFile } = parseArgs();

    const fullPath = workflowDir
      ? path.resolve(process.cwd(), workflowDir, workflowPath)
      : path.resolve(process.cwd(), workflowPath);

    if (!fs.existsSync(fullPath)) {
      throw new Error(`Workflow file not found: ${fullPath}. CWD: ${process.cwd()}`);
    }

    const workflowModule = await import(fullPath);
    const workflow = workflowModule.default as WorkflowBlock<any>;

    if (!workflow || workflow.type !== 'workflow') {
      throw new Error(`File ${workflowPath} does not export a workflow as default export`);
    }

    const initialContext = await loadContext(contextFile);

    const db = new Database('workflows.db');
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