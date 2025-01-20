import type { Extension, Builder } from "../dsl/new-dsl";
import { JsonObject } from "../dsl/types";

export const fileExtension = <
  CurrentBuilder extends Builder<JsonObject, JsonObject, JsonObject>
>(
  builder: CurrentBuilder,
) => {
  return {
    ...builder,
    file: (title: string, path: string) => builder.step(
      'first step',
      () => ({ files: { config: path }, addedToContext: "it worked!" })),
  }
}