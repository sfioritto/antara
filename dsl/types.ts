import type { FileStore } from '../file-stores';
import { WORKFLOW_EVENTS, STEP_EVENTS, STATUS } from './constants';

export { WorkflowBlock } from './workflow-block';

export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = JsonValue[];
export type JsonObject = { [Key in string]?: JsonValue };
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

export type SerializedError = {
  name: string;
  message: string;
  stack?: string;
}

export interface WorkflowConfiguration {
  fileStore: FileStore
  workflowDir?: string
}

export type Context<ContextShape> = ContextShape extends object
  ? { [K in keyof ContextShape]: ContextShape[K] extends JsonValue ? ContextShape[K] : never }
  : never;

export type Action<ContextShape, ResultShape> = (
  context: ContextShape,
  configuration: WorkflowConfiguration
) => (Promise<ResultShape> | ResultShape);

export type Reducer<ContextShape, ResultShape> = (result: ResultShape, context: ContextShape) => ContextShape;

export type StepFunction<ContextShape> = (
  context: ContextShape,
  configuration: WorkflowConfiguration
) => Promise<JsonObject> | JsonObject;

export interface ActionBlock<ContextShape, ResultShape> {
  type: "action";
  handler: Action<ContextShape, ResultShape>;
}

export interface ReducerBlock<ContextShape, ResultShape> {
  type: "reducer";
  handler: Reducer<ContextShape, ResultShape>;
}

export interface StepEventBlock<ContextShape> {
  type: "event";
  eventType: StepEventTypes;
  handler: EventHandler<ContextShape>;
}

export interface WorkflowEventBlock<ContextShape> {
  type: "workflow";
  eventType: WorkflowEventTypes;
  handler: EventHandler<ContextShape>;
}

export interface WorkflowMetadata {
  name: string;
  description?: string;
}

export interface FileContext {
  files: { [fileName: string]: string };
}

export type StepEventTypes = typeof STEP_EVENTS[keyof typeof STEP_EVENTS];
export type WorkflowEventTypes = typeof WORKFLOW_EVENTS[keyof typeof WORKFLOW_EVENTS];
export type StatusOptions = typeof STATUS[keyof typeof STATUS];
export type AllEventTypes = StepEventTypes | WorkflowEventTypes;

export interface Event<ContextShape, Options = any> {
  workflowName?: string,
  previousContext: ContextShape,
  newContext: ContextShape,
  error?: SerializedError,
  type: AllEventTypes,
  status: StatusOptions,
  completedStep?: Step<ContextShape>,
  steps?: Step<ContextShape>[],
  options?: Options,
}

export type EventHandler<ContextShape> = (event: Event<ContextShape>) => void;

export interface Step<ContextShape> {
  title: string
  status: StatusOptions
  context: ContextShape
  error?: SerializedError
}