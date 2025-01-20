import type { JsonObject } from "../dsl/types";
import type { Builder } from "../dsl/new-dsl";

export const fileExtension = <ContextIn extends JsonObject>(
  builder: Builder<ContextIn, JsonObject, JsonObject>
) => {
  return {
    file: (title: string, path: string) => builder.step(
      'first step',
      () => ({ files: { config: path }, addedToContext: "it worked!" })),
  }
}