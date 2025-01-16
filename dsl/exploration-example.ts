import { createWorkflow } from "./exploration";

// Example usage
const myWorkflow = createWorkflow()
  .step("Get coverage", async () => {
    return {
      coverage: { files: ["file1.ts", "file2.ts"] }
    };
  })
  .step("Find lowest coverage", async (context) => {
    // context now has { coverage: { files: string[] } }
    return {
      lowestCoverageFile: { path: context.coverage.files[0] }
    };
  })
  .step("For hovering over context to see type inference", async (context) => {
    // context has coverage + lowestCoverageFile
    // => we can do context.lowestCoverageFile.path etc.
    return {
      hovered: !!context.lowestCoverageFile
    };
  })
  .build("Test Coverage");

// The resulting workflow is typed so that the final .run()
// will return { coverage: { files: string[] }, lowestCoverageFile: { path: string }, hovered: boolean }

(async () => {
  const finalResult = await myWorkflow.run();
  console.log(finalResult.coverage.files);
  console.log(finalResult.lowestCoverageFile.path);
  console.log(finalResult.hovered);
})();
