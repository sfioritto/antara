import type { WorkflowEvent, StepEvent } from "../dsl";
import { WORKFLOW_EVENTS, STEP_EVENTS } from "../dsl";

export abstract class Adapter {
  async started?(event: WorkflowEvent<any>): Promise<void>;
  async updated?(event: WorkflowEvent<any>): Promise<void>;
  async completed?(event: WorkflowEvent<any>): Promise<void>;
  async error?(event: WorkflowEvent<any>): Promise<void>;
  async stepComplete?(event: StepEvent<any, any>): Promise<void>;
  async stepError?(event: StepEvent<any, any>): Promise<void>;

  async dispatch(event: WorkflowEvent<any> | StepEvent<any, any>) {
    if ('steps' in event) {  // WorkflowEvent
      if (event.type === WORKFLOW_EVENTS.START && this.started) {
        await this.started(event);
      } else if (event.type === WORKFLOW_EVENTS.UPDATE && this.updated) {
        await this.updated(event);
      } else if (event.type === WORKFLOW_EVENTS.COMPLETE && this.completed) {
        await this.completed(event);
      } else if (event.type === WORKFLOW_EVENTS.ERROR && this.error) {
        await this.error(event);
      }
    } else {  // StepEvent
      if (event.type === STEP_EVENTS.COMPLETE && this.stepComplete) {
        await this.stepComplete(event);
      } else if (event.type === STEP_EVENTS.ERROR && this.stepError) {
        await this.stepError(event);
      }
    }
  }
}
