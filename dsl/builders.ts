import type { z } from 'zod';
import type { PromptClient } from '../types';
import { AnthropicClient } from '../clients/anthropic';
import { WORKFLOW_EVENTS } from './constants';
import type {
  Action,
  Reducer,
  ActionBlock,
  ReducerBlock,
  StepEventBlock,
  WorkflowEventBlock,
  WorkflowMetadata,
  StepEventTypes,
  WorkflowEventTypes,
  AllEventTypes,
  EventHandler,
  FileContext,
  Context,
  JsonObject,
  StepFunction
} from './types';
import { StepBlock } from './step-block';
import { WorkflowBlock } from './workflow-block';

function on<ContextShape>(
  event: StepEventTypes,
  handler: EventHandler<ContextShape>
): StepEventBlock<ContextShape>;
function on<ContextShape>(
  event: WorkflowEventTypes,
  handler: EventHandler<ContextShape>
): WorkflowEventBlock<ContextShape>;
function on<ContextShape>(
  event: AllEventTypes,
  handler: EventHandler<ContextShape>
): StepEventBlock<ContextShape> | WorkflowEventBlock<ContextShape> {
  if (event.startsWith('workflow:')) {
    return {
      type: "workflow",
      eventType: event as WorkflowEventTypes,
      handler: handler as EventHandler<ContextShape>,
    };
  }

  return {
    type: "event",
    eventType: event as StepEventTypes,
    handler: handler as EventHandler<ContextShape>,
  };
}

const reduce = <ContextShape, ResultShape>(
  handler: Reducer<ContextShape, ResultShape>
): ReducerBlock<ContextShape, ResultShape> => ({
  type: "reducer",
  handler,
});

function action<ContextShape, ResultShape>(
  handler: Action<ContextShape, ResultShape>
): ActionBlock<ContextShape, ResultShape>;
function action<ContextShape, WorkflowContextShape>(
  workflow: WorkflowBlock<WorkflowContextShape>,
  initialState: (() => WorkflowContextShape) | WorkflowContextShape
): ActionBlock<ContextShape, WorkflowContextShape>;
function action<ContextShape, ResultShape>(
  handlerOrWorkflow: Action<ContextShape, ResultShape> | WorkflowBlock<ResultShape>,
  initialState?: (() => ResultShape) | ResultShape
): ActionBlock<ContextShape, ResultShape> {
  if (handlerOrWorkflow instanceof WorkflowBlock) {
    if (!initialState) {
      throw new Error("initialState is required when using a workflow as an action");
    }
    return {
      type: "action",
      handler: async () => {
        let finalContext: ResultShape | undefined;
        const initialContext = (initialState instanceof Function)
          ? initialState()
          : initialState;

        for await (const event of handlerOrWorkflow.run({
          initialContext: initialContext as Context<ResultShape>
        })) {
          if (event.type === WORKFLOW_EVENTS.COMPLETE) {
            finalContext = event.newContext;
          }
          if (event.type === WORKFLOW_EVENTS.ERROR && event.error) {
            const error = new Error(event.error.message);
            error.name = event.error.name;
            error.stack = event.error.stack;
            throw error;
          }
        }

        if (!finalContext) {
          throw new Error("Workflow did not complete successfully");
        }

        return finalContext;
      }
    };
  }

  return {
    type: "action",
    handler: handlerOrWorkflow,
  };
}

export function prompt<ContextShape, ResultShape extends z.ZodObject<any>>(
  config: {
    template: (context: ContextShape) => string,
    responseModel: {
      schema: ResultShape,
      name: string
    }
  },
  client?: PromptClient
): ActionBlock<ContextShape, z.infer<ResultShape>>;
export function prompt<ContextShape, ResultShape extends z.ZodObject<any>>(
  template: (context: ContextShape) => string,
  responseModel: {
    schema: ResultShape,
    name: string
  },
  client?: PromptClient,
): ActionBlock<ContextShape, z.infer<ResultShape>>;
export function prompt<ContextShape, ResultShape extends z.ZodObject<any>>(
  templateOrConfig: ((context: ContextShape) => string) | {
    template: (context: ContextShape) => string,
    responseModel: {
      schema: ResultShape,
      name: string
    }
  },
  responseModelOrClient?: {
    schema: ResultShape,
    name: string
  } | PromptClient,
  client?: PromptClient,
): ActionBlock<ContextShape, z.infer<ResultShape>> {
  let finalTemplate: (context: ContextShape) => string;
  let finalResponseModel: { schema: ResultShape, name: string };
  let finalClient: PromptClient | undefined;

  if (typeof templateOrConfig === 'function') {
    finalTemplate = templateOrConfig;
    finalResponseModel = responseModelOrClient as { schema: ResultShape, name: string };
    finalClient = client;
  } else {
    finalTemplate = templateOrConfig.template;
    finalResponseModel = templateOrConfig.responseModel;
    finalClient = responseModelOrClient as PromptClient;
  }

  return {
    type: "action",
    handler: async (context: ContextShape): Promise<z.infer<ResultShape>> => {
      const promptString = finalTemplate(context);
      const defaultClient = new AnthropicClient();
      const result = await (finalClient ?? defaultClient).execute<ResultShape>(promptString, finalResponseModel);

      return result as z.infer<ResultShape>;
    }
  };
}

function step<ContextShape, ResultShape>(
  title: string,
  ...args: | [ActionBlock<ContextShape, ResultShape>, ...StepEventBlock<ContextShape>[]]
        | [ActionBlock<ContextShape, ResultShape>, ReducerBlock<ContextShape, ResultShape>, ...StepEventBlock<ContextShape>[]]
): StepBlock<ContextShape, ResultShape>;
function step<ContextShape>(
  title: string,
  stepFn: StepFunction<ContextShape>,
  ...events: StepEventBlock<ContextShape>[]
): StepBlock<ContextShape, JsonObject>;
function step<ContextShape, ResultShape>(
  title: string,
  actionOrFunction: ActionBlock<ContextShape, ResultShape> | StepFunction<ContextShape>,
  ...rest: (StepEventBlock<ContextShape> | ReducerBlock<ContextShape, ResultShape>)[]
): StepBlock<ContextShape, ResultShape> | StepBlock<ContextShape, JsonObject> {
  // If it's a function, create action and reducer blocks
  if (typeof actionOrFunction === 'function') {
    const stepFunction: StepFunction<ContextShape> = actionOrFunction;
    const actionBlock: ActionBlock<ContextShape, JsonObject> = {
      type: 'action',
      handler: stepFunction,
    };

    const reducerBlock: ReducerBlock<ContextShape, JsonObject> = {
      type: 'reducer',
      handler: (result, context) => ({
        ...context,
        ...result
      })
    };

    const events = rest as StepEventBlock<ContextShape>[];
    return new StepBlock(title, actionBlock, events, reducerBlock);
  }

  const actionBlock: ActionBlock<ContextShape, ResultShape> = actionOrFunction;
  const hasReducer = rest[0]?.type === 'reducer';
  const reducer = hasReducer ? rest[0] as ReducerBlock<ContextShape, ResultShape> : undefined;
  const events = (hasReducer ? rest.slice(1) : rest) as StepEventBlock<ContextShape>[];

  return new StepBlock(
    title,
    actionBlock,
    events,
    reducer
  );
}

const workflow = <ContextShape>(
  metadata: WorkflowMetadata | string,
  ...blocks: Array<StepBlock<ContextShape> | WorkflowEventBlock<ContextShape>>
): WorkflowBlock<ContextShape> => {
  const normalizedMetadata = typeof metadata === "string"
    ? { name: metadata }
    : metadata;

  const { name, description } = normalizedMetadata;
  return new WorkflowBlock(name, blocks, description);
};

function file<ContextShape extends FileContext>(
  fileName: string,
  filePath: string,
): StepBlock<ContextShape, string> {
  return step(
    `Reading file: ${fileName}`,
    action(async (context, { fileStore, workflowDir }) => {
      if (context.files && fileName in context.files) {
        throw new Error(`File name "${fileName}" already exists in this workflow run. Names must be unique within a workflow.`);
      }
      return await fileStore.readFile(filePath, workflowDir);
    }),
    reduce((fileContents, context) => ({
      ...context,
      files: {
        ...context.files,
        [fileName]: fileContents
      }
    }))
  );
}

function files<ContextShape extends FileContext>(
  filePathMap: Record<string, string>
): StepBlock<ContextShape, Record<string, string>> {
  return step(
    `Reading files: ${Object.keys(filePathMap).join(', ')}`,
    action(async (context, { fileStore, workflowDir }) => {
      // Check for conflicts with existing files in context
      const conflicts = Object.keys(filePathMap)
        .filter(name => context.files && name in context.files);
      if (conflicts.length > 0) {
        throw new Error(`File names already exist in this workflow run: ${conflicts.join(', ')}`);
      }

      // Read all files in parallel
      const entries = Object.entries(filePathMap);
      const fileContents = await Promise.all(
        entries.map(([_, filePath]) => fileStore.readFile(filePath, workflowDir))
      );

      // Create map of filename to content
      return Object.fromEntries(
        entries.map(([fileName], index) => [fileName, fileContents[index]])
      );
    }),
    reduce((fileContentsMap, context) => ({
      ...context,
      files: {
        ...context.files,
        ...fileContentsMap
      }
    }))
  );
}

export {
  workflow,
  step,
  action,
  reduce,
  on,
  file,
  files,
};