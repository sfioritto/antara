import type { Extension, Builder } from "../dsl/new-dsl";
import type { JsonObject } from "../dsl/types";

export type FileContext = {
  files: Record<string, string>;
}

// Example of a file extension
export const filesExtension: Extension<JsonObject, JsonObject, JsonObject, {
  file(name: string, path: string): Builder<FileContext, any, any>
}> = {
  name: 'files',
  create: ({ builder }) => ({
    file(name: string, path: string) {
      return builder.step(
        `Reading file: ${name}`,
        async ({ context }) => {
          const ctx = context as Partial<FileContext>;
          if (ctx.files && name in ctx.files) {
            throw new Error(
              `File name "${name}" already exists in this workflow run. Names must be unique within a workflow.`
            );
          }
          return {
            files: {
              [name]: "File content will go here."
            }
          };
        },
        ({ result, context }) => ({
          ...context,
          files: {
            ...(context as Partial<FileContext>).files,
            ...result.files
          }
        })
      );
    }
  })
};