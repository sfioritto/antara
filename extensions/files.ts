import type { JsonObject } from '../dsl/types';
import type { FileStore } from '../file-stores';
import type { FileContext } from '../dsl/types';

interface FilesExtensionConfig {
  fileStore?: FileStore;
}

export function filesExtension<
  InitialContext extends JsonObject,
  WorkflowOptions extends JsonObject
>(config?: FilesExtensionConfig) {
  return {
    files<ContextIn extends FileContext>(
      filePathMap: Record<string, string>
    ) {
      return {
        title: `Reading files: ${Object.keys(filePathMap).join(', ')}`,
        action: async ({ context }: { context: ContextIn }) => {
          if (!config?.fileStore) {
            throw new Error('FileStore is required for files extension');
          }

          // Check for conflicts with existing files in context
          const conflicts = Object.keys(filePathMap)
            .filter(name => context.files && name in context.files);
          if (conflicts.length > 0) {
            throw new Error(`File names already exist in this workflow run: ${conflicts.join(', ')}`);
          }

          // Read all files in parallel
          const entries = Object.entries(filePathMap);
          const fileContents = await Promise.all(
            entries.map(([_, filePath]) => config.fileStore!.readFile(filePath))
          );

          // Create map of filename to content
          return Object.fromEntries(
            entries.map(([fileName], index) => [fileName, fileContents[index]])
          );
        },
        reduce: ({ result, context }: {
          result: Record<string, string>,
          context: ContextIn
        }) => ({
          ...context,
          files: {
            ...context.files,
            ...result
          }
        })
      };
    }
  };
}
