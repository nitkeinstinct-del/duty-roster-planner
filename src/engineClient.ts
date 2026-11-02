// Types shared with the Python engine (public/roster_engine.py) + the worker client.
// On this branch there is NO TypeScript solver: every roster is computed by Python in a web worker.

export type Person = { name: string; leave: number[] };
export type Task = { name: string; req: number; from: number; to: number; days?: number[]; shiftLen: number; restBefore?: number; restAfter?: number };
export type Config = {
    days: number;
    minRest: number;
    comfortRest: number;
    balance: number;
    firstWeekday: number;
    weekendDays: number[];
    seed: number;
    iterations: number;
};
export type Slot = { id: number; day: number; task: number; start: number; end: number; weekend: boolean };
export type Stats = { name: string; shifts: number; hours: number; nights: number; weekendHours: number; target: number; minGap: number | null; leaveDays: number };
export type Feasibility = 'full' | 'proven-infeasible' | 'not-found';
export type Result = { feasibility: Feasibility; reason: string; minRestUsed: number; slots: Slot[]; assign: number[][]; uncovered: number; violations: string[]; stats: Stats[]; cost: number; engine?: string };

export const defaultConfig: Config = { days: 14, minRest: 8, comfortRest: 24, balance: 0.4, firstWeekday: 0, weekendDays: [5, 6], seed: 1, iterations: 40000 };

type Payload = { cfg: Config; people: Person[]; tasks: Task[]; maxRest: boolean };
type WorkerReply = { id: number; status?: string; ok?: boolean; result?: Result; error?: string };

let worker: Worker | null = null;
let seq = 0;

function killWorker() {
    if (worker) { worker.terminate(); worker = null; }
}

/** Solve in Python (Pyodide) inside a web worker. Rejects if the Python engine cannot load or run -
    there is deliberately no TypeScript fallback on this branch. A failure kills the worker so the
    next attempt retries from scratch (e.g. after the network comes back). */
export function solveInPython(payload: Payload, onStatus: (s: string) => void): Promise<Result> {
    if (!worker) {
        try {
            worker = new Worker('pyworker.mjs', { type: 'module' });
        } catch (e) {
            return Promise.reject(e instanceof Error ? e : new Error('לא ניתן להפעיל Web Worker בדפדפן הזה'));
        }
    }
    const w = worker;
    return new Promise<Result>((resolve, reject) => {
        const id = ++seq;
        const fail = (msg: string) => { killWorker(); reject(new Error(msg)); };
        const errorHandler = (e: ErrorEvent) => fail('ה-Worker של מנוע הפייתון קרס: ' + (e.message || 'שגיאה לא ידועה'));
        const handler = (e: MessageEvent<WorkerReply>) => {
            const m = e.data;
            if (!m || m.id !== id) return;
            if (m.status) { onStatus(m.status); return; }
            w.removeEventListener('message', handler);
            w.removeEventListener('error', errorHandler);
            if (m.ok && m.result) resolve(m.result);
            else fail(m.error || 'מנוע הפייתון נכשל');
        };
        w.addEventListener('message', handler);
        w.addEventListener('error', errorHandler);
        w.postMessage({ id, payload });
    });
}
