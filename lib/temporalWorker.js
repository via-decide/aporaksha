import { continueAsNew, sleep, workflow } from '@temporalio/workflow';
import { Worker } from '@temporalio/worker';

/**
 * Fix #4: Temporal Interceptor (Isolates OTel tracing from determinism)
 */
export class TraceContextInterceptor {
  async execute(input, next) {
    const traceContext = input.headers?.['trace-context'] 
      ? JSON.parse(input.headers['trace-context']) 
      : { trace_id: 'new-trace-id' };

    console.log(`[Trace] Workflow started: ${input.workflowType} with Trace ID: ${traceContext.trace_id}`);
    try {
      const result = await next({
        ...input,
        headers: { ...input.headers, 'trace-context': JSON.stringify(traceContext) }
      });
      console.log(`[Trace] Workflow succeeded: ${input.workflowType}`);
      return result;
    } catch (error) {
      console.error(`[Trace] Workflow failed: ${input.workflowType}`, error);
      throw error;
    }
  }
}

/**
 * Fix #6: Temporal Fan-Out Pagination
 * Prevents event history bloat with massive breach lists
 */
export async function BreachRevalidationParentWorkflow(incidentId, affectedUserIds, currentPageIndex = 0) {
  const BATCH_SIZE = 1000;
  const startIdx = currentPageIndex * BATCH_SIZE;
  const endIdx = Math.min(startIdx + BATCH_SIZE, affectedUserIds.length);
  const currentBatch = affectedUserIds.slice(startIdx, endIdx);

  const childHandles = [];
  for (let i = 0; i < currentBatch.length; i += 100) {
    const subBatch = currentBatch.slice(i, i + 100);
    // Dummy child workflow logic simulation
    const handle = await workflow.startChild('BreachRevalidationBatchChild', {
      args: [incidentId, subBatch]
    });
    childHandles.push(handle);
  }

  let batchCompleted = 0;
  for (const handle of childHandles) {
    const result = await handle.result();
    batchCompleted += (result?.completed || 0);
  }

  if (endIdx < affectedUserIds.length) {
    await continueAsNew(incidentId, affectedUserIds, currentPageIndex + 1);
  }

  return { total_users: affectedUserIds.length, completed: batchCompleted };
}

// Worker Setup
export async function runTemporalWorker() {
  const worker = await Worker.create({
    workflowsPath: require.resolve('./temporalWorker.js'),
    taskQueue: 'default',
    interceptors: {
      workflow: [() => new TraceContextInterceptor()]
    }
  });

  await worker.run();
}
