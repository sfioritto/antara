import type { Event } from "../dsl";
import { WORKFLOW_EVENTS, STEP_EVENTS } from "../dsl";

export abstract class Adapter {
  async started?(event: Event<any>): Promise<void>;
  async updated?(event: Event<any>): Promise<void>;
  async completed?(event: Event<any>): Promise<void>;
  async error?(event: Event<any>): Promise<void>;

  async dispatch(event: Event<any>) {
    if (event.type === WORKFLOW_EVENTS.START && this.started) {
      await this.started(event);
    } else if (event.type === WORKFLOW_EVENTS.UPDATE && this.updated) {
      await this.updated(event);
    } else if (event.type === WORKFLOW_EVENTS.COMPLETE && this.completed) {
      await this.completed(event);
    } else if (event.type === WORKFLOW_EVENTS.ERROR && this.error) {
      await this.error(event);
    }
  }
}
