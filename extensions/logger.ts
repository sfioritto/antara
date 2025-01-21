import type { Extension, Builder } from "../dsl/new-dsl";
import { JsonObject } from "../dsl/types";

export interface LoggerContext extends JsonObject {
  logs: string[];
}

export type LoggerExtension<T extends Record<string, any>> = {
  log: (message: string) => Builder<LoggerContext, JsonObject, JsonObject, T>;
}

export const loggerExtension: Extension<{}, LoggerExtension<any>> = (builder) => ({
  log: (message: string) =>
    builder.step(
      `Log: ${message}`,
      () => ({ logs: [message] })
    ) as unknown as Builder<LoggerContext, JsonObject, JsonObject, LoggerExtension<any>>
});
