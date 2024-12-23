import { workflow, step, action, reducer, on } from './dsl.js';
import type { WorkflowEvent } from './dsl.js';

// Simple notification handler
async function notifyComplete(event: WorkflowEvent) {
  console.log(`✅ Step completed: ${JSON.stringify(event.result)}`);
}

async function notifyError(event: WorkflowEvent) {
  console.log(`❌ Step failed: ${event.error?.message}`);
}

// Simulate some async operations
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const userRegistration = workflow({
  initialState: {
    user: null,
    validationResult: null,
    notification: null
  },
  steps: [
    step(
      "Validate user input",
      action(async (state) => {
        await delay(1000); // Simulate API call
        return {
          isValid: true,
          validatedData: {
            email: "user@example.com",
            name: "Test User"
          }
        };
      }),
      reducer((state, result) => ({
        ...state,
        validationResult: result,
        user: result.validatedData
      })),
      on("step:complete", notifyComplete),
      on("step:error", notifyError)
    ),

    step(
      "Create user account",
      action(async (state) => {
        await delay(1500); // Simulate database operation
        return {
          userId: "123",
          created: new Date().toISOString()
        };
      }),
      reducer((state, result) => ({
        ...state,
        user: {
          ...state.user,
          id: result.userId,
          createdAt: result.created
        }
      })),
      on("step:complete", notifyComplete)
    ),

    step(
      "Send welcome email",
      action(async (state) => {
        await delay(800); // Simulate email sending
        return {
          emailSent: true,
          sentAt: new Date().toISOString()
        };
      }),
      reducer((state, result) => ({
        ...state,
        notification: result
      })),
      on("step:complete", notifyComplete),
      on("step:error", notifyError)
    )
  ]
});

// Run the workflow
console.log("🚀 Starting user registration workflow...\n");

userRegistration.run()
  .then(({ state, status }) => {
    console.log("\n✨ Workflow completed!");
    console.log("\nFinal Status:");
    status.forEach(step => {
      const icon = step.status === 'complete' ? '✅' :
                   step.status === 'error' ? '❌' :
                   step.status === 'running' ? '⏳' : '⏸️';
      console.log(`${icon} ${step.name}: ${step.status}`);
    });

    console.log("\nFinal State:");
    console.log(JSON.stringify(state, null, 2));
  })
  .catch(error => {
    console.error(" Workflow failed:", error);
  });


  // Usage example
// const improveTestCoverage = workflow({
//   initialState: {
//     project: null,
//     coverage: null,
//     files: {
//       lowest_coverage: null,
//       related: [],
//       test: null
//     },
//   },
//   steps: [
//     step(
//       "Find file with lowest coverage",
//       action(async (state) => {
//         const coverage = await TestCoverage.analyze();
//         return {
//           coverage,
//           lowest_coverage_file: coverage.find_lowest()
//         };
//       }),
//       reducer((state, result) => ({
//         ...state,
//         coverage: result.coverage,
//         files: {
//           ...state.files,
//           lowest_coverage: result.lowest_coverage_file
//         }
//       })),
//       on("step:complete", notifySlack),
//       on("step:error", requestReview)
//     ),

//     step(
//       "Generate test",
//       action(async (state) => {
//         const codeFile = new CodeFile(state.files.lowest_coverage);
//         const relatedFiles = state.files.related;
//         const testFile = await new TestGenerator(codeFile, relatedFiles).generate();
//         return { test_file: testFile };
//       }),
//       reducer((state, result) => ({
//         ...state,
//         files: {
//           ...state.files,
//           test: result.test_file
//         }
//       })),
//       on("step:complete", notifySlack)
//     ),

//     step(
//       "Validate and commit",
//       action(async (state) => {
//         const testFile = state.files.test;
//         const result = await testFile.validate();
//         if (result.is_valid) {
//           const commit = await new GitCommit(testFile)
//             .withMessage("Add test coverage")
//             .push();
//           return {
//             validation: result,
//             commit
//           };
//         }
//         throw new Error("ValidationError");
//       }),
//       reducer((state, result) => ({
//         ...state,
//         validation: result.validation,
//         commit: result.commit
//       })),
//       on("step:error", requestReview)
//     ),

//     step(
//       "Clean up temporary files",
//       action(async (state) => {
//         await cleanup_temp_files();
//         return { status: 'cleaned' };
//       }),
//       on("step:complete", async (event) => {
//         if (event.result?.status === 'cleaned') {
//           console.log("Cleanup successful");
//         }
//       })
//     )
//   ]
// });