// Represents a workflow step function that transforms the context
type StepFunction<TContextIn, TContextOut> = (context: TContextIn) => TContextOut;

// Base interface for extensions to implement
interface WorkflowExtension<TBuilder extends WorkflowBuilder<any>> {
  // Extensions receive the builder instance and return methods to add
  extend(builder: TBuilder): Record<string, (...args: any[]) => TBuilder>;
}

// The builder class needs to be generic over its context
class WorkflowBuilder<TContext> {
  private steps: Array<{
    name: string;
    fn: StepFunction<any, any>;
  }> = [];

  constructor(private extensions: WorkflowExtension<WorkflowBuilder<any>>[]) {
    // Apply extensions
    for (const extension of extensions) {
      const methods = extension.extend(this);
      Object.assign(this, methods);
    }
  }

  // Step method needs to handle type transformation
  step<TNewContext>(
    name: string,
    fn: StepFunction<TContext, TNewContext>
  ): WorkflowBuilder<TNewContext> {
    this.steps.push({ name, fn });
    // Create new builder with updated context type
    return new WorkflowBuilder<TNewContext>(this.extensions);
  }

  done(): TContext {
    // Execute workflow and return final context
    let context = {} as TContext;
    for (const step of this.steps) {
      context = step.fn(context);
    }
    return context;
  }
}

// Example extension that adds methods and updates context type
interface WithAddOne {
  addedValue: number;
}

const addOneExtension: WorkflowExtension<WorkflowBuilder<any>> = {
  extend(builder) {
    return {
      // The method must return a new builder with updated context type
      addOne<T>(): WorkflowBuilder<T & WithAddOne> {
        return builder.step('addOne', (context: T) => ({
          ...context,
          addedValue: (context as any).addedValue || 0 + 1
        }));
      }
    };
  }
};

function createWorkflow<T>(
  extensions: WorkflowExtension<WorkflowBuilder<T>>[] = []
): WorkflowBuilder<T> {
  return new WorkflowBuilder<T>(extensions);
}

interface InitialContext {
  count: number;
}

const workflow = createWorkflow([addOneExtension]);

const result = workflow
  .step<InitialContext>('first', () => ({ count: 1 }))
  // TypeScript knows context has { count: number }
  .step('second', (context) => ({ ...context, count: context.count + 1 }))
  // TypeScript knows about addOne from extension
  .addOne()
  .done();


// interface StepBlock<
//   ActionResult,
//   ContextIn extends Context,
//   ContextOut extends Context
// > {
//   title: string,
//   action: Action<ActionResult>,
//   reduce: Reducer<ActionResult, ContextIn, ContextOut>,
// }

// type FileExtensionReturn<ContextIn extends Context> = ReturnType<typeof fileExtension<ContextIn>>;
// type LoggerExtensionReturn<ContextIn extends Context> = ReturnType<typeof loggerExtension<ContextIn>>;

// function fileExtension<ContextIn extends Context> (
//   builder: Builder<ContextIn>
// ) {
//   return {
//     file: {
//       write() {
//         return builder.step(
//           "file step", () => console.log("file action"),
//           (result, context) => {
//             console.log('context in file', context)
//             return {
//               ...context,
//               file: "file content",
//             };
//           }
//         )
//       }
//     },
//   };
// }

// function loggerExtension<ContextIn extends Context>(
//   builder: Builder<ContextIn>
// ) {
//   return {
//     log() {
//       return builder.step(
//         "Log step", () => console.log("logging action"),
//         (result: any, context) => {
//           return {
//             ...context,
//             logger: "log step",
//           }
//         }
//       );
//     }
//   };
// }

// const extensions = [fileExtension, loggerExtension] as const;


// type ExtensionReturnType<E> = E extends (builder: Builder<infer ContextIn>) => infer ReturnType
//   ? ReturnType
//   : never;

// // ... existing code ...

// type CombinedExtensionReturn<
//   ContextIn,
//   Extensions extends readonly any[]
// > = Extensions extends readonly [(builder: Builder<any>) => infer R, ...infer Rest]
//   ? R & (Rest extends ((builder: Builder<any>) => any)[]
//       ? CombinedExtensionReturn<ContextIn, Rest>
//       : {})
//   : {};

// Remove ExtensionReturnType since we're now inferring R directly
// type ExtensionReturn<ContextIn extends Context> = CombinedExtensionReturn<ContextIn, typeof extensions>;

// type DirectReturn = ReturnType<typeof fileExtension<{file: string}>>;
// type TEST = ExtensionReturnType<typeof fileExtension>
// type ExtensionReturn<ContextIn extends Context> = CombinedExtensionReturn<ContextIn, typeof extensions>;
// type Original = FileExtensionReturn<{ file: string }> & LoggerExtensionReturn<{ file: string }>;
// type NEW = ExtensionReturn<{file: string}>

// type Extension = <ContextIn extends Context>(builder: Builder<ContextIn>) => {[key: string]: any;}

// function createExtensions<ContextIn extends Context>(
//   builder: Builder<ContextIn>,
//   extensions: Extension[],
// ) {
//   return extensions.reduce((acc, extension) => ({
//     ...acc,
//     ...extension<ContextIn>(builder)
//   }), {} as any);
// }

// function createWorkflow<
//   ContextIn extends Context,
// >(
//   options: {
//     steps?: StepBlock<Action<any>, Context, Context>[];
//     extensions?: Extension[];
//   } = {}
// ): ExtendedBuilder<ContextIn, FileExtensionReturn<ContextIn> & LoggerExtensionReturn<ContextIn>> {
//   const { steps = [], extensions = [] } = options;

  // const builder: Builder<ContextIn> = {
  //   step(title: string, action, reduce) {
  //     const stepBlock = {
  //       title,
  //       action,
  //       reduce
  //     };
  //     type ContextOut = ReturnType<typeof reduce>;
  //     return createWorkflow<ContextOut>({
  //       steps: [...steps, stepBlock] as StepBlock<Action<any>, Context, Context>[],
  //       extensions
  //     });
  //   },
  //   run() {
  //     let context = {};
  //     for (const { title, action, reduce } of steps) {
  //       const result = action();
  //       context = reduce(result, context);
  //       console.log(JSON.stringify(context, null, 2));
  //     }
  //   }
  // };

//   return {
//     ...builder,
//     ...createExtensions(builder, extensions)
//   }
// }

// const workflow = createWorkflow({ extensions: [fileExtension, loggerExtension] });
// workflow
//   .log()
//   .file.write()
//   .step('first', () => 'first step action', (result, context) => ({ ...context, step1: result + context.logger }))
//   .step('second', () => 'second step action', (result, context) => ({ ...context, step2: result + context.step1 }))
//   .step('third', () => 'third step action', (result, context) => ({ ...context, step3: result + context.step2 }))
//   .run();