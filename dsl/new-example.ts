import { createWorkflow } from "./new-dsl";

// Example usage
const myWorkflow = createWorkflow("workflow name")
  .step("Get coverage", () => {
      return {
      coverage: { files: ["file1.ts", "file2.ts"] }
    };
  })
  .step("Find lowest coverage", ({ context }) => {
    // context now has { coverage: { files: string[] } }
    return {
      lowestCoverageFile: { path: context.coverage.files[0] }
    };
  })
  .step("For hovering over context to see type inference", ({ context }) => {
    // context has coverage + lowestCoverageFile
    // => we can do context.lowestCoverageFile.path etc.
    return {
      hovered: !!context.lowestCoverageFile
    };
  });

// The resulting workflow is typed so that the final .run()
// will return { coverage: { files: string[] }, lowestCoverageFile: { path: string }, hovered: boolean }

(async () => {
  const workflow = await myWorkflow.run({ initialContext: { cool: 'cool' } });

  // START event
  const start = await workflow.next();
  console.log('Workflow started:', start.value);

  // Each step will produce an UPDATE event
  const step1 = await workflow.next();
  console.log('Step 1 completed:', step1);

  const step2 = await workflow.next();
  console.log('Step 2 completed:', step2.value);

  const step3 = await workflow.next();
  console.log('Step 3 completed:', step3.value);

  // COMPLETE event
  const complete = await workflow.next();
  console.log('Workflow completed:', complete.value?.newContext);
})();
