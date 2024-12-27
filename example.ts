import { workflow, step, action, reduce, on } from './dsl.js';
import type { JsonObject } from 'type-fest';

// Simulate async operations
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Event handlers
const notifyComplete = ({ result }: { result?: any }) => {
  console.log(`✅ Step completed: ${JSON.stringify(result)}`);
};

const notifyError = ({ error }: { error?: Error }) => {
  console.log(`❌ Step failed: ${error?.message}`);
};

// Define the state shape
interface RegistrationState extends JsonObject {
  user: null | {
    id?: string;
    email?: string;
    name?: string;
    createdAt?: string;
  };
  validationResult: any;
  notification: any;
  security: {
    mfaEnabled: boolean;
    mfaRequired?: boolean;
    mfaSecret?: string;
    backupCodes?: string[];
    securityQuestions: Array<{ question: string; answer: string }>;
    riskAssessment?: any;
  };
  onboarding: {
    progress: number;
    completedSteps: string[];
  };
  preferences: any;
  analytics: {
    registrationStart: string | null;
    sessionId?: string;
    timeToComplete: number | null;
    completionStatus?: boolean;
  };
}

const initialState: RegistrationState = {
  user: null,
  validationResult: null,
  notification: null,
  security: {
    mfaEnabled: false,
    securityQuestions: [],
  },
  onboarding: {
    progress: 0,
    completedSteps: [],
  },
  preferences: null,
  analytics: {
    registrationStart: null,
    timeToComplete: null,
  }
};

const userRegistration = workflow<RegistrationState>(
  on("workflow:start", () => {
    console.log("Workflow started");
  }),
  on("workflow:complete", () => {
    console.log("Workflow completed");
  }),
  on("workflow:error", () => {
    console.log("Workflow failed");
  }),
  on("workflow:update", () => {
    console.log("Workflow updated");
  }),
  step(
    "Initialize analytics",
    action(() => ({
      startTime: new Date().toISOString(),
      sessionId: Math.random().toString(36).substring(7)
    })),
    reduce((result, state) => ({
      ...state,
      analytics: {
        ...state.analytics,
        registrationStart: result.startTime,
        sessionId: result.sessionId
      }
    })),
    on("step:complete", notifyComplete)
  ),

  step(
    "Validate user input",
    action(async () => {
      await delay(1000);
      return {
        isValid: true,
        validatedData: {
          email: "user@example.com",
          name: "Test User"
        }
      };
    }),
    reduce((result, state) => ({
      ...state,
      validationResult: result,
      user: result.validatedData
    })),
    on("step:complete", notifyComplete),
    on("step:error", notifyError)
  ),

  // ... remaining steps follow the same pattern
  step(
    "Create user account",
    action(async () => {
      await delay(1500);
      return {
        userId: "123",
        created: new Date().toISOString()
      };
    }),
    reduce((result, state) => ({
      ...state,
      user: {
        ...state.user,
        id: result.userId,
        createdAt: result.created
      }
    })),
    on("step:complete", notifyComplete)
  ),

  step(
    "Security assessment",
    action(async () => {
      await delay(1200);
      const geoLocation = await fetch('https://api.example.com/geo').then(r => r.json());
      return {
        riskScore: Math.random() * 100,
        requiresMFA: true,
        location: geoLocation,
        recommendedSecurityLevel: 'high'
      };
    }),
    reduce((result, state) => ({
      ...state,
      security: {
        ...state.security,
        riskAssessment: result,
        mfaRequired: result.requiresMFA
      }
    })),
    on("step:complete", notifyComplete),
    on("step:error", notifyError)
  )
);

userRegistration.run(initialState).then(({ state, status }) => {
  console.log(status);
  return state;
});