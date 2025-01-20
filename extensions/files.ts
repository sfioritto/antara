import type { Extension, Builder } from "../dsl/new-dsl";
import { JsonObject } from "../dsl/types";

export type FileExtension = {
  file: (title: string, path: string) => Builder<JsonObject, JsonObject, JsonObject, FileExtension>
}

export const fileExtension: Extension<FileExtension> = (
  builder,
) => {
  return {
    file: (title: string, path: string) => builder.step(
      'first step',
      () => ({ files: { config: path }, addedToContext: "it worked!" })),
  }
}