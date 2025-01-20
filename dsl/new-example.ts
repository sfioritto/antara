import { createWorkflow, withFiles } from './new-dsl';

// Original example showing type inference
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

// Additional examples showing options and different patterns

// Example with workflow options
const optionsExample = {
  features: ['speed', 'maneuver'],
}

const optionsWorkflow = createWorkflow<typeof optionsExample>("options test")
  .step(
    "Step 1",
    () => ({ count: 1 }),
    ({ result }) => result
  )
  .step(
    "Step 2",
    ({ context, options }) => ({ doubled: context.count * 2 }),
    ({ result, context, options }) => ({
      ...context,
      doubled: result.doubled,
      featureOne: options.features[0],
    })
  )
  .step(
    "Step 3",
    ({ context, options }) => ({
      message: `${context.count} doubled is ${context.doubled}`,
      featureTwo: options.features[1],
    }))
  .step(
    "Step 4",
    ({ context }) => console.log(context),
);

// Example of running workflows with different options
async function runOptionsExample() {
  const workflowRun = optionsWorkflow.run({
    options: optionsExample,
  })

  const stepOne = await workflowRun.next()
  console.log(stepOne.value?.options)

  const workflowRunTwo = optionsWorkflow.run({
    options: {
      ...optionsExample,
      workflowRunId: 4,
    }
  })

  const stepAgain = await workflowRunTwo.next()
  console.log(stepAgain.value?.options)
  console.log(stepAgain.value?.previousContext)
}

// Example of a simpler workflow with just actions
const actionOnlyWorkflow = createWorkflow("actions only")
  .step("First step", () => ({ firstStep: "first" }))
  .step("Second step", ({ context }) => ({ secondStep: context.firstStep }))

// Example using the files extension
const fileWorkflow = createWorkflow("file example")
  .file("config", "config.json")
  .step("Process config", ({ context }) => {
    // TypeScript should infer that context has files.config
    console.log("Config file content:", context.files.config);
    return {
      processed: true
    };
  }).step("title", () => ({ cool: "thing" }))
  .step("check context", ({ context }) => console.log(context.cool));

// Run the file workflow
(async () => {
  const workflow = await fileWorkflow.run({});

  for await (const event of workflow) {
    if (event.completedStep) {
      console.log(`Step "${event.completedStep.title}":`, event.newContext);
    }
  }
})();
