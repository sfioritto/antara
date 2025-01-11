import { workflow, step, action, reduce, on } from './dsl';

interface ImportPath {
  current_import_path: string;
  target_file_path: string;
}

interface ImportPaths {
  imports: ImportPath[];
}

interface WorkflowState {
  coverage: { initial: number; current: number; };
  originalTest: string;
  testFilePath: string;
  forgePath: string;
  updatedTest: string;
  suggestions: string[];
}

const mockAnthropicClient = {
  analyze: async (content: string): Promise<ImportPaths> => ({
    imports: [
      {
        current_import_path: './old/path',
        target_file_path: './new/correct/path'
      }
    ]
  }),

  suggestImprovements: async (test: string): Promise<string[]> => ([
    "Add test case for error handling",
    "Include boundary condition tests",
    "Test null input scenarios"
  ])
};

const mockCoverageService = {
  measure: async (test: string): Promise<number> =>
    Math.min(100, Math.floor(Math.random() * 30) + 70) // Returns 70-100
};

const calculateRelativeImport = (fromPath: string, toPath: string): string => {
  return toPath.replace('.new', '').replace('.old', '');
};

const updateImports = (
  testFile: string,
  filePath: string,
  importPaths: ImportPaths
): string => {
  let updated = testFile;
  for (const importPath of importPaths.imports) {
    const updatedPath = calculateRelativeImport(filePath, importPath.target_file_path);
    updated = updated.replace(importPath.current_import_path, updatedPath);
  }
  return updated;
};

const testImprovementWorkflow = workflow<WorkflowState>(
  {
    name: "Test Coverage Improvement",
    description: "Workflow to analyze and improve test coverage"
  },

  // Step 1: Analyze imports and fix paths
  step("Analyze and fix import paths",
    action(async (state) => {
      const importPaths = await mockAnthropicClient.analyze(state.originalTest);
      return importPaths;
    }),
    reduce((importPaths: ImportPaths, state) => ({
      ...state,
      updatedTest: updateImports(
        state.originalTest,
        state.testFilePath.toLowerCase().replace(state.forgePath.toLowerCase() + '/', ''),
        importPaths
      )
    })),
    on('step:complete', () => {
      console.log('Import paths updated successfully');
    })
  ),

  // Step 2: Measure initial coverage
  step("Measure initial test coverage",
    action(async (state: WorkflowState) => {
      const coverage = await mockCoverageService.measure(state.updatedTest);
      return coverage;
    }),
    reduce((coverage: number, state: WorkflowState) => ({
      ...state,
      coverage: {
        initial: coverage,
        current: coverage
      }
    })),
    on('step:complete', ({ newContext: finalContext }) => {
      console.log(`Initial coverage: ${finalContext?.coverage?.initial}%`);
    })
  ),

  // Step 3: Get improvement suggestions
  step("Generate test improvement suggestions",
    action(async (state) => {
      const suggestions = await mockAnthropicClient.suggestImprovements(state.updatedTest);
      return suggestions;
    }),
    reduce((suggestions: string[], state) => ({
      ...state,
      suggestions
    })),
    on('step:complete', ({ newContext: finalContext }) => {
      console.log('Generated improvement suggestions:', finalContext?.suggestions);
    })
  ),

  // Workflow-level events
  on('workflow:start', () => {
    console.log('Starting test improvement workflow');
  }),
  on('workflow:complete', ({ newContext: finalContext }) => {
    console.log('Workflow completed');
    console.log('Final coverage:', finalContext?.coverage?.current);
    console.log('Suggestions:', finalContext?.suggestions);
  })
);

// Example usage
const initialState: WorkflowState = {
  originalTest: "import { something } from './old/path';\n// test content",
  testFilePath: "/forge/tests/example.test.ts",
  forgePath: "/forge",
  coverage: { initial: 0, current: 0 },
  updatedTest: "",
  suggestions: []
};

const nestedWorkflow = workflow<{ foo?: string; updatedTest?: string }>(
  "Nested Workflow",
  step("First Step",
    action(async () => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      return { foo: 'bar' };
    }),
    reduce(({ foo }, context) => ({
      ...context,
      foo
    }))
  ),
  step("Second Step",
    action(testImprovementWorkflow, initialState),
    reduce(({ updatedTest }, context) => ({
      ...context,
      updatedTest
    }))
  ),
  on('workflow:complete', ({ newContext: finalContext }) => {
    console.log('Nested workflow completed');
    console.log('Final context:', finalContext);
  })
);

for await (const event of testImprovementWorkflow.run({ initialContext: initialState })) {
  console.log(event);
}

for await (const event of nestedWorkflow.run({ initialContext: {} })) {
  console.log(event);
}