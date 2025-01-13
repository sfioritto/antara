import { workflow, step, action, reduce, on, prompt } from './dsl/builders';
import type { Context } from './dsl/types';

interface ExampleState {
  foo: string;
  count: number;
}

// Add types for handlers
const handler = (state: ExampleState) => {
  // ...
};

const reducer = (result: any, state: ExampleState) => {
  // ...
};

// Add types for event handlers
const onComplete = ({ finalContext }: { finalContext: ExampleState }) => {
  // ...
};