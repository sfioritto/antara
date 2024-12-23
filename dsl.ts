import { v4 as uuidv4 } from 'uuid';

type State = Record<string, any>;
type Result = Record<string, any>;

interface WorkflowEvent {
  event: string;
  state: State;
  result?: Result;
  error?: Error;
}

type EventHandler = (event: WorkflowEvent) => Promise<void>;
type Action = (state: State) => Promise<Result>;
type Reducer = (state: State, result: Result) => State;

// Core builder types
interface StepEvent {
  event: 'step:complete' | 'step:error';
  handler: EventHandler;
}

interface StepAction {
  type: 'action';
  fn: Action;
}

interface StepReducer {
  type: 'reducer';
  fn: Reducer;
}

interface Step {
  id: string;
  title: string;
  action: Action;
  reduce?: Reducer;
  events: StepEvent[];
}

// Core builders
const action = (fn: Action): StepAction => ({
  type: 'action',
  fn
});

const reducer = (fn: Reducer): StepReducer => ({
  type: 'reducer',
  fn
});

const on = (event: 'step:complete' | 'step:error', handler: EventHandler): StepEvent => ({
  event,
  handler
});

// Type that ensures StepAction is present and only one StepReducer
type StepArgs =
  | [StepAction, ...Array<StepEvent>]
  | [StepAction, StepReducer, ...Array<StepEvent>]
  | [...Array<StepEvent>, StepAction]
  | [...Array<StepEvent>, StepAction, StepReducer]
  | [StepReducer, StepAction, ...Array<StepEvent>]
  | [StepReducer, ...Array<StepEvent>, StepAction];

function step(title: string, ...args: StepArgs) {
  let stepAction: Action | undefined;
  let stepReducer: Reducer | undefined;
  const events: StepEvent[] = [];

  args.forEach(arg => {
    if ('type' in arg) {
      if (arg.type === 'action') stepAction = arg.fn;
      if (arg.type === 'reducer') stepReducer = arg.fn;
    } else {
      events.push(arg);
    }
  });

  return {
    id: uuidv4(),
    title,
    action: stepAction!,  // Safe to use ! because type system ensures action exists
    reduce: stepReducer,
    events
  };
}

interface WorkflowConfig {
  initialState?: State;
  steps: Step[];
}

interface StepStatus {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  error?: Error;
}

function workflow(config: WorkflowConfig) {
  let state = config.initialState ?? {};
  // Initialize status array upfront with all steps in 'pending' state
  let status: StepStatus[] = config.steps.map(step => ({
    id: step.id,
    name: step.title,
    status: 'pending'
  }));

  const run = async () => {
    for (const { id, title, action, reduce, events } of config.steps) {
      // Update status to running
      const statusIndex = status.findIndex(s => s.id === id);
      status[statusIndex].status = 'running';

      try {
        const result = await action(state);
        state = reduce?.(state, result) ?? state;

        // Update to complete
        status[statusIndex].status = 'complete';

        for (const { event, handler } of events) {
          if (event === 'step:complete') {
            await handler({ event, state, result });
          }
        }
      } catch (error) {
        // Update to error
        status[statusIndex].status = 'error';
        status[statusIndex].error = error as Error;

        for (const { event, handler } of events) {
          if (event === 'step:error') {
            await handler({ event, state, error: error as Error });
          }
        }
        throw error;
      }
    }

    return {
      state: { ...state },
      status: status.map(s => ({ ...s }))
    };
  };

  return {
    run,
  };
}

// Event handlers example
async function notifySlack(event: WorkflowEvent) {
  if (event.error) {
    console.log(`Error in step: ${event.error}`);
  } else {
    console.log(`Step complete: ${event.result}`);
  }
}

async function requestReview(event: WorkflowEvent) {
  if (event.error) {
    console.log(`Review needed for error: ${event.error}`);
  }
}

// Usage example
const improveTestCoverage = workflow({
  initialState: {
    project: null,
    coverage: null,
    files: {
      lowest_coverage: null,
      related: [],
      test: null
    },
  },
  steps: [
    step(
      "Find file with lowest coverage",
      action(async (state) => {
        const coverage = await TestCoverage.analyze();
        return {
          coverage,
          lowest_coverage_file: coverage.find_lowest()
        };
      }),
      reducer((state, result) => ({
        ...state,
        coverage: result.coverage,
        files: {
          ...state.files,
          lowest_coverage: result.lowest_coverage_file
        }
      })),
      on("step:complete", notifySlack),
      on("step:error", requestReview)
    ),

    step(
      "Generate test",
      action(async (state) => {
        const codeFile = new CodeFile(state.files.lowest_coverage);
        const relatedFiles = state.files.related;
        const testFile = await new TestGenerator(codeFile, relatedFiles).generate();
        return { test_file: testFile };
      }),
      reducer((state, result) => ({
        ...state,
        files: {
          ...state.files,
          test: result.test_file
        }
      })),
      on("step:complete", notifySlack)
    ),

    step(
      "Validate and commit",
      action(async (state) => {
        const testFile = state.files.test;
        const result = await testFile.validate();
        if (result.is_valid) {
          const commit = await new GitCommit(testFile)
            .withMessage("Add test coverage")
            .push();
          return {
            validation: result,
            commit
          };
        }
        throw new Error("ValidationError");
      }),
      reducer((state, result) => ({
        ...state,
        validation: result.validation,
        commit: result.commit
      })),
      on("step:error", requestReview)
    ),

    step(
      "Clean up temporary files",
      action(async (state) => {
        await cleanup_temp_files();
        return { status: 'cleaned' };
      }),
      on("step:complete", async (event) => {
        if (event.result?.status === 'cleaned') {
          console.log("Cleanup successful");
        }
      })
    )
  ]
});

// Run the workflow
improveTestCoverage.run()
  .then(finalState => console.log('Workflow completed:', finalState))
  .catch(error => console.error('Workflow failed:', error));


// Stubs

class CodeFile {
  private path: string;

  constructor(path: string) {
    this.path = path;
  }

  // Add any methods you need
  async validate() {
    return {
      is_valid: true
    };
  }
}

class TestGenerator {
  private sourceFile: CodeFile;
  private relatedFiles: string[];

  constructor(sourceFile: CodeFile, relatedFiles: string[] = []) {
    this.sourceFile = sourceFile;
    this.relatedFiles = relatedFiles;
  }

  async generate() {
    // Simulate test generation
    return new CodeFile('generated_test.ts');
  }
}

class GitCommit {
  private file: CodeFile;
  private message: string = '';

  constructor(file: CodeFile) {
    this.file = file;
  }

  withMessage(message: string) {
    this.message = message;
    return this;
  }

  async push() {
    return {
      hash: 'abc123',
      message: this.message,
      timestamp: new Date()
    };
  }
}

class TestCoverage {
  static async analyze() {
    return {
      overall: 85,
      files: {
        'src/main.ts': 90,
        'src/utils.ts': 75
      },
      find_lowest: () => 'src/utils.ts'
    };
  }
}

async function cleanup_temp_files(): Promise<void> {
  // Simulate cleanup
  return Promise.resolve();
}

export {
  CodeFile,
  TestGenerator,
  GitCommit,
  TestCoverage,
  cleanup_temp_files
};