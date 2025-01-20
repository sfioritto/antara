import type { Extension } from "../dsl/new-dsl";

export const fileExtension: Extension = (
  builder,
) => {
  return {
    file: (title: string, path: string) => builder.step(
      'first step',
      () => ({ files: { config: path }, addedToContext: "it worked!" })),
  }
}