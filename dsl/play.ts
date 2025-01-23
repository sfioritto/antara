type Context = Record<string, string | number | boolean>

type StepFunction<TWorkflow extends Workflow> = (context: Context) => TWorkflow

interface Builder<TWorkflow extends Workflow> {
  step: StepFunction<TWorkflow>
}

type ExtensionRecord<TWorkflow extends Workflow> = {
  [prop: string]: StepFunction<TWorkflow> | object | ExtensionRecord<TWorkflow>;
}

type Extension<TWorkflow extends Workflow = any> = (builder: Builder<TWorkflow>) => ExtensionRecord<TWorkflow>

class Workflow {
  private extended: ExtensionRecord<typeof this>= {};
  private context: object = {};
  private builder: Builder<typeof this>;

  constructor(private options: {
    extensions: Array<Extension<any>>
    initialContext: Context
  } = {
    extensions: [],
    initialContext: {}
  }) {
    this.options.extensions = this.options.extensions as unknown as Array<Extension<typeof this>>

    this.context = this.options.initialContext;
    const workflow = this;

    this.builder = {
      step(toAdd: Context) {
        workflow.context = {
          ...toAdd,
          ...workflow.context,
        };
        return workflow;
      }
    }

    for (const extension of this.options.extensions) {
      this.extended = { ...this.extended, ...extension(this.builder) }
    }

    return new Proxy(this, {
      get(target, prop: string) {
        if (prop === 'step') {
          return target.builder.step;
        }

        if (prop in target.extended) {
          return target.extended[prop];
        }

        throw new Error("That property is not available on this workflow.")
      }
    })
  }
}

type WorkflowInstance = {
  step: (toAdd: Context) => WorkflowInstance;
  [key: string]: any;
}

function createExtension(fn: Extension<Workflow>): Extension<Workflow> {
  return fn;
}

const firstExtension = createExtension((builder) => ({
  first: () => builder.step
    ({ first: 'first' })
}));

const secondExtension: Extension = (builder) => ({ second: () => builder.step({ second: 'second' }) })

function createWorkflow() {
  const extensions = [firstExtension, secondExtension]
  type Test = ReturnType<typeof firstExtension>
  const workflow = new Workflow({ extensions, initialContext: {} })
  return workflow as unknown as Builder<Workflow> & ReturnType<typeof firstExtension>
}

const workflow = new Workflow() as unknown as WorkflowInstance;
workflow.step({ cool: 1 }).step({ step: 'two' })

// const workflow = new Workflow(extensions=[simpleExtension])

// workflow.step({ baseStep: 'base' }).first().second().step({ finalStep: "final" })

// this would result in context being:

// { first: 'first', second: 'second', baseStep: 'base', finalStep: 'final' }
