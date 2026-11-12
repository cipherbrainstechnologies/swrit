import { runWorkerInWeb } from "./server/env";
import { startWorker } from "./worker/runner";

const g = globalThis as unknown as { __dearSwritsinhWorker?: boolean };

if (process.env.NEXT_PHASE !== "phase-production-build" && runWorkerInWeb() && !g.__dearSwritsinhWorker) {
  g.__dearSwritsinhWorker = true;
  startWorker({ name: "in-process" });
}
