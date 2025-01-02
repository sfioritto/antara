import type { WorkflowEvent, StepEvent } from "../dsl";
import { WORKFLOW_EVENTS } from "../dsl";

export abstract class Adapter {
  async started?(event: WorkflowEvent<any>): Promise<void>;
  async updated?(event: WorkflowEvent<any>): Promise<void>;
  async completed?(event: WorkflowEvent<any>): Promise<void>;

  async dispatch(event: WorkflowEvent<any> | StepEvent<any, any>) {
    if (event.type === WORKFLOW_EVENTS.START && this.started) {
      await this.started(event);
    } else if (event.type === WORKFLOW_EVENTS.UPDATE && this.updated) {
        await this.updated(event);
    } else if (event.type === WORKFLOW_EVENTS.COMPLETE && this.completed) {
      await this.completed(event);
    }
  }
}
