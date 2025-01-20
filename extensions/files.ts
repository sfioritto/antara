import type { Extension, Builder } from "../dsl/new-dsl";
import { JsonObject } from "../dsl/types";

export interface FileContext extends JsonObject {
  files?: Record<string, string>;
}

export type FileExtension = {
  file: (title: string, path: string) => Builder<FileContext, JsonObject, JsonObject, FileExtension>;
}

export const fileExtension: Extension<{}, FileExtension> = (builder) => ({
  file: (title: string, path: string) =>
    builder.step(
      title,
      () => ({ files: { [title]: path } })
    ) as Builder<FileContext, JsonObject, JsonObject, FileExtension>
});