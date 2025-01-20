import { createWorkflow } from './new-dsl';
import { fileExtension, type FileContext, type FileExtension } from '../extensions/files';
import { loggerExtension, type LoggerContext, type LoggerExtension } from '../extensions/logger';

// Create a type that combines both extension contexts
type CombinedContext = FileContext & LoggerContext;
// Create a type that combines both extension blocks
type CombinedExtensions = FileExtension & LoggerExtension;

// Create a workflow that uses both extensions
const combinedWorkflow = createWorkflow<{}, CombinedExtensions, CombinedContext>("combined workflow", [ fileExtension,
  loggerExtension])
  .file("config", "config.json")
  .log("Added config file")
  .step("Final step", ({ context }: { context: CombinedContext }) => {
    // We have access to both file and log context
    console.log("Files:", context.files);
    console.log("Logs:", context.logs);
    return context;
  });

// Run the workflow
(async () => {
  const workflow = await combinedWorkflow.run({});

  for await (const event of workflow) {
    if (event.completedStep) {
      console.log(`Step "${event.completedStep.title}":`, event.newContext);
    }
  }
})();