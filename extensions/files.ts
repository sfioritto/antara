import type { ExtensionBuilder } from "../dsl/new-dsl";
import { JsonObject } from "../dsl/types";

export const fileExtension = <
  Builder extends ExtensionBuilder
>(
  builder: Builder,
) => {
  return {
    ...builder,
    file: (title: string, path: string) => builder.step(
      'first step',
      () => ({ files: { config: path }, addedToContext: "it worked!" })),
  }
}