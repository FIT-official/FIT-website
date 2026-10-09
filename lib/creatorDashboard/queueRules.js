import { DashboardError } from './flags';
export const jobTransitions = { quote_due: ['queued'], queued: ['assigned'], assigned: ['printing', 'queued', 'failed'],
    printing: ['qc', 'failed'], qc: ['done', 'failed'], done: [], failed: [] };
export function queueChange(job, input, printerIds) {
    const updates = {};
    if (input.printerId !== undefined) {
        if (!printerIds.includes(input.printerId)) throw new DashboardError('Choose a printer from the manual list');
        if (!['queued', 'assigned'].includes(job.status)) throw new DashboardError('Only queued or assigned jobs can be assigned');
        updates.printerId = input.printerId; updates.status = 'assigned';
    }
    if (input.status !== undefined) {
        if (typeof input.status !== 'string' || !Object.hasOwn(jobTransitions, input.status)) throw new DashboardError('Invalid job status');
        if (input.status === 'printing' && !(updates.printerId || job.printerId)) throw new DashboardError('Assign a printer before printing', 400);
        if (input.status === 'assigned' && !(updates.printerId || job.printerId)) throw new DashboardError('Choose a printer');
        if (job.status !== input.status && !jobTransitions[job.status]?.includes(input.status)) throw new DashboardError('Invalid job status transition');
        updates.status = input.status;
    }
    if (updates.status === 'queued') updates.printerId = null;
    if (updates.status === 'failed' && (!input.reason || typeof input.reason !== 'string')) throw new DashboardError('Add a reason for the failed print');
    if (input.priority !== undefined) {
        if (!Number.isInteger(input.priority) || input.priority < 0 || input.priority > 5) throw new DashboardError('Priority must be between 0 and 5');
        updates.priority = input.priority;
    }
    if (input.dueAt !== undefined) {
        const date = input.dueAt === null ? null : new Date(input.dueAt);
        if (date && !Number.isFinite(date.getTime())) throw new DashboardError('Invalid due date');
        updates.dueAt = date;
    }
    for (const key of ['estMinutes', 'estGrams', 'actualMinutes', 'actualGrams']) if (input[key] !== undefined) {
        if (!Number.isFinite(input[key]) || input[key] < 0 || input[key] > 1000000) throw new DashboardError('Invalid print estimate');
        updates[key] = input[key];
    }
    return updates;
}
