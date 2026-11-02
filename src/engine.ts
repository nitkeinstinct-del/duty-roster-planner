// Duty-roster engine. Heuristic (greedy + simulated annealing), NOT a proven-optimal solver.
// Times are hours from the start of day 0 (fractions allowed, e.g. 6.5 = 06:30).

export type Person = { name: string; leave: number[] }; // leave = day indexes the person is NOT at base (input only)
// A task runs inside a clock window each active day, cut into shifts of shiftLen hours.
// from=0,to=24 on every day = continuous 24/7. to <= from means the window crosses midnight (e.g. 22 -> 6).
export type Task = { name: string; req: number; from: number; to: number; days?: number[]; shiftLen: number };
export type Config = {
    days: number;
    minRest: number; // hard: hours off between two shifts of the same person
    comfortRest: number; // soft: rest below this is penalised
    balance: number; // 0..1: 0 = favour long rests, 1 = favour fairness
    firstWeekday: number; // 0=Sun..6=Sat, weekday of day 0
    weekendDays: number[];
    seed: number;
    iterations: number;
};
export type Slot = { id: number; day: number; task: number; start: number; end: number; weekend: boolean };
export type Stats = { name: string; shifts: number; hours: number; nights: number; weekendHours: number; target: number; minGap: number | null; leaveDays: number };
export type Feasibility = 'full' | 'proven-infeasible' | 'not-found';
export type Result = { feasibility: Feasibility; reason: string; minRestUsed: number; slots: Slot[]; assign: number[][]; uncovered: number; violations: string[]; stats: Stats[]; cost: number };

export const defaultConfig: Config = { days: 14, minRest: 8, comfortRest: 24, balance: 0.4, firstWeekday: 0, weekendDays: [5, 6], seed: 1, iterations: 40000 };
const U = 8; // normalisation unit (hours) for cost terms

export const dur = (s: { start: number; end: number }) => s.end - s.start;
/** hours of [start,end) that fall in 22:00-06:00 */
export function nightHours(start: number, end: number): number {
    let h = 0;
    for (let d = Math.floor(start / 24) - 1; d <= Math.floor(end / 24); d++)
        for (const [a, b] of [[d * 24, d * 24 + 6], [d * 24 + 22, d * 24 + 24]]) h += Math.max(0, Math.min(end, b) - Math.max(start, a));
    return h;
}

export function buildSlots(cfg: Config, tasks: Task[]): Slot[] {
    const slots: Slot[] = [];
    const wk = (d: number) => cfg.weekendDays.includes((cfg.firstWeekday + d) % 7);
    tasks.forEach((t, ti) => {
        const len = Math.max(0.5, t.shiftLen);
        const windows: [number, number][] = [];
        const continuous = t.from === 0 && t.to === 24 && !t.days;
        if (continuous) windows.push([0, cfg.days * 24]);
        else for (let d = 0; d < cfg.days; d++) {
            if (t.days && !t.days.includes(d)) continue;
            const to = t.to <= t.from ? t.to + 24 : t.to;
            windows.push([d * 24 + t.from, d * 24 + to]);
        }
        for (const [a, b] of windows) for (let s = a; s < b - 1e-9; s += len) {
            const e = Math.min(b, s + len);
            slots.push({ id: slots.length, day: Math.floor(s / 24), task: ti, start: s, end: e, weekend: wk(Math.floor(s / 24)) });
        }
    });
    return slots.sort((x, y) => x.start - y.start || x.task - y.task).map((s, i) => ({ ...s, id: i }));
}

function rng(seed: number) {
    let s = seed >>> 0 || 1;
    return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gapBetween = (a: Slot, b: Slot) => (a.start <= b.start ? b.start - a.end : a.start - b.end);
function onLeave(p: Person, s: { start: number; end: number }) {
    for (let d = Math.floor(s.start / 24); d <= Math.floor((s.end - 1e-9) / 24); d++) if (p.leave.includes(d)) return true;
    return false;
}

/** Independent hard-constraint checker, also used by tests. */
export function validate(cfg: Config, people: Person[], tasks: Task[], slots: Slot[], assign: number[][]): string[] {
    const v: string[] = [];
    const per: Slot[][] = people.map(() => []);
    slots.forEach((s, i) => {
        const real = assign[i].filter((x) => x >= 0);
        if (new Set(real).size !== real.length) v.push(`slot ${i}: same person twice`);
        for (const p of real) { per[p].push(s); if (onLeave(people[p], s)) v.push(`${people[p].name} משובץ ביום ${s.day + 1} שבו הוא לא בבסיס`); }
    });
    per.forEach((list, p) => {
        list.sort((a, b) => a.start - b.start);
        for (let i = 1; i < list.length; i++) { const g = list[i].start - list[i - 1].end; if (g < cfg.minRest - 1e-9) v.push(`${people[p].name}: מנוחה ${g}h < ${cfg.minRest}h לפני יום ${list[i].day + 1}`); }
    });
    return v;
}

type Ctx = { slots: Slot[]; avail: number[]; availSum: number; totH: number; nightH: number; wkH: number };
function mkCtx(cfg: Config, people: Person[], tasks: Task[]): Ctx {
    const slots = buildSlots(cfg, tasks);
    const avail = people.map((p) => cfg.days - new Set(p.leave.filter((d) => d >= 0 && d < cfg.days)).size);
    let totH = 0, nightH = 0, wkH = 0;
    slots.forEach((s) => { const n = tasks[s.task].req; totH += dur(s) * n; nightH += nightHours(s.start, s.end) * n; if (s.weekend) wkH += dur(s) * n; });
    return { slots, avail, availSum: avail.reduce((a, b) => a + b, 0) || 1, totH, nightH, wkH };
}
/** Shared cost: fairness (hours, nights, weekend, relative to time at base) + rest below comfort. */
function costOf(cfg: Config, ctx: Ctx, per: Slot[][]): number {
    const wF = cfg.balance, wR = (1 - cfg.balance) * 2 + 0.05;
    let c = 0;
    per.forEach((l, p) => {
        let h = 0, n = 0, w = 0;
        l.forEach((s, i) => {
            h += dur(s); n += nightHours(s.start, s.end); if (s.weekend) w += dur(s);
            if (i > 0) { const g = s.start - l[i - 1].end; if (g < cfg.comfortRest) c += wR * ((cfg.comfortRest - g) / U) ** 2; }
        });
        const t = (x: number) => (x * ctx.avail[p]) / ctx.availSum;
        c += wF * (((h - t(ctx.totH)) / U) ** 2 + ((n - t(ctx.nightH)) / U) ** 2 + 0.5 * ((w - t(ctx.wkH)) / U) ** 2);
    });
    return c;
}

export function solve(cfg: Config, people: Person[], tasks: Task[]): Result {
    const ctx = mkCtx(cfg, people, tasks);
    const { slots } = ctx;
    const rand = rng(cfg.seed);
    const N = people.length;
    const pos: { slot: number; k: number }[] = [];
    slots.forEach((s) => { for (let k = 0; k < tasks[s.task].req; k++) pos.push({ slot: s.id, k }); });
    const assign: number[][] = slots.map((s) => Array(tasks[s.task].req).fill(-1));
    const lists = (): Slot[][] => { const per: Slot[][] = people.map(() => []); slots.forEach((s, i) => assign[i].forEach((p) => p >= 0 && per[p].push(s))); per.forEach((l) => l.sort((a, b) => a.start - b.start)); return per; };
    const cost = () => { let c = 0; for (const a of assign) for (const p of a) if (p < 0) c += 1e6; return c + costOf(cfg, ctx, lists()); };

    const canTake = (p: number, slotId: number): boolean => {
        const s = slots[slotId];
        if (onLeave(people[p], s) || assign[slotId].includes(p)) return false;
        for (let i = 0; i < slots.length; i++) {
            if (i === slotId || !assign[i].includes(p)) continue;
            if (slots[i].start > s.end + cfg.minRest + 1 || slots[i].end < s.start - cfg.minRest - 1) continue;
            if (gapBetween(slots[i], s) < cfg.minRest - 1e-9) return false;
        }
        return true;
    };

    const load = people.map(() => 0);
    for (const q of pos) {
        const cands = people.map((_, p) => p).filter((p) => canTake(p, q.slot));
        if (!cands.length) continue;
        cands.sort((a, b) => load[a] / (ctx.avail[a] || 1) - load[b] / (ctx.avail[b] || 1) || rand() - 0.5);
        assign[q.slot][q.k] = cands[0]; load[cands[0]] += dur(slots[q.slot]);
    }

    let cur = cost(), best = cur;
    let bestAssign = assign.map((a) => a.slice());
    const iters = cfg.iterations;
    for (let it = 0; it < iters && pos.length > 1; it++) {
        const T = 3 * (1 - it / iters) + 0.01;
        const a = pos[Math.floor(rand() * pos.length)];
        const old = assign[a.slot][a.k];
        if (rand() < 0.5) {
            const p = Math.floor(rand() * N);
            if (p === old) continue;
            assign[a.slot][a.k] = -1;
            if (!canTake(p, a.slot)) { assign[a.slot][a.k] = old; continue; }
            assign[a.slot][a.k] = p;
            const nc = cost();
            if (nc <= cur || rand() < Math.exp((cur - nc) / T)) cur = nc; else assign[a.slot][a.k] = old;
        } else {
            const b = pos[Math.floor(rand() * pos.length)];
            const ob = assign[b.slot][b.k];
            if (old === ob || old < 0 || ob < 0 || a.slot === b.slot) continue;
            assign[a.slot][a.k] = -1; assign[b.slot][b.k] = -1;
            if (!canTake(ob, a.slot) || !canTake(old, b.slot)) { assign[a.slot][a.k] = old; assign[b.slot][b.k] = ob; continue; }
            assign[a.slot][a.k] = ob; assign[b.slot][b.k] = old;
            // the pair check above ignores a<->b interaction; reject if they now clash
            const clash = (x: number, y: number) => { const p = assign[x].includes(old) && assign[y].includes(old); return p && gapBetween(slots[x], slots[y]) < cfg.minRest - 1e-9; };
            const nc = clash(a.slot, b.slot) ? Infinity : cost();
            if (nc <= cur || rand() < Math.exp((cur - nc) / T)) cur = nc; else { assign[a.slot][a.k] = old; assign[b.slot][b.k] = ob; }
        }
        if (cur < best) { best = cur; bestAssign = assign.map((x) => x.slice()); }
    }
    bestAssign.forEach((a, i) => (assign[i] = a));

    const per = lists();
    const stats: Stats[] = people.map((p, i) => {
        const l = per[i]; let minGap: number | null = null;
        for (let j = 1; j < l.length; j++) { const g = l[j].start - l[j - 1].end; if (minGap === null || g < minGap) minGap = g; }
        return { name: p.name, shifts: l.length, hours: l.reduce((n, s) => n + dur(s), 0), nights: Math.round(l.reduce((n, s) => n + nightHours(s.start, s.end), 0) * 10) / 10, weekendHours: l.filter((s) => s.weekend).reduce((n, s) => n + dur(s), 0), target: Math.round(((ctx.totH * ctx.avail[i]) / ctx.availSum) * 10) / 10, minGap, leaveDays: new Set(p.leave.filter((d) => d >= 0 && d < cfg.days)).size };
    });
    const uncovered = assign.reduce((n, a) => n + a.filter((p) => p < 0).length, 0);
    const violations = validate(cfg, people, tasks, slots, assign);
    const fz = feasibility(cfg, people, tasks, slots, uncovered);
    return { feasibility: fz.f, reason: fz.reason, minRestUsed: cfg.minRest, slots, assign, uncovered, violations, stats, cost: best };
}

/** Counting arguments that PROVE infeasibility. If none applies and coverage failed, the answer is only "not found". */
export function feasibility(cfg: Config, people: Person[], tasks: Task[], slots: Slot[], uncovered: number): { f: Feasibility; reason: string } {
    if (uncovered === 0) return { f: 'full', reason: '' };
    for (const s of slots) {
        const free = people.filter((p) => !onLeave(p, s)).length;
        if (free < tasks[s.task].req) return { f: 'proven-infeasible', reason: `ביום ${s.day + 1} (${tasks[s.task].name}) נדרשים ${tasks[s.task].req} אנשים אבל רק ${free} נמצאים בבסיס` };
    }
    // concurrent demand at the start of each slot vs people present that day
    for (const s of slots) {
        let need = 0;
        for (const o of slots) if (o.start <= s.start && o.end > s.start) need += tasks[o.task].req;
        const free = people.filter((p) => !onLeave(p, { start: s.start, end: s.start + 1e-6 })).length;
        if (need > free) return { f: 'proven-infeasible', reason: `ביום ${s.day + 1} נדרשים ${need} אנשים במקביל ורק ${free} בבסיס` };
    }
    const minLen = Math.min(...slots.map(dur));
    const perPersonMax = Math.floor((cfg.days * 24 + cfg.minRest) / (minLen + cfg.minRest));
    const demand = slots.reduce((n, s) => n + tasks[s.task].req, 0);
    if (demand > people.length * perPersonMax) return { f: 'proven-infeasible', reason: `סך העמדות הנדרשות (${demand}) גדול מהמקסימום האפשרי (${people.length * perPersonMax}) כשמנוחה מינימלית היא ${cfg.minRest} שעות` };
    return { f: 'not-found', reason: 'החיפוש לא מצא שיבוץ מלא, אבל זה לא הוכחה שאין כזה' };
}

/** User priority: full coverage first, then as much rest as possible. Tries the largest hard minimum rest that still yields full coverage. A failed try only means "not found". */
export function solveMaxRest(cfg: Config, people: Person[], tasks: Task[]): Result {
    const floor = cfg.minRest;
    for (let r = Math.max(floor, 48); r >= floor; r--) {
        const res = solve({ ...cfg, minRest: r, iterations: Math.min(cfg.iterations, 8000) }, people, tasks);
        if (res.slots.length === 0) return res;
        if (res.uncovered === 0 && res.violations.length === 0) {
            const fin = solve({ ...cfg, minRest: r }, people, tasks);
            return fin.uncovered === 0 && fin.violations.length === 0 ? fin : res;
        }
    }
    return solve(cfg, people, tasks);
}

/** Exhaustive optimum of the same cost for tiny instances (tests only). */
export function bruteForce(cfg: Config, people: Person[], tasks: Task[]): { cost: number; assign: number[][] } | null {
    const ctx = mkCtx(cfg, people, tasks);
    const { slots } = ctx;
    const pos: { slot: number; k: number }[] = [];
    slots.forEach((s) => { for (let k = 0; k < tasks[s.task].req; k++) pos.push({ slot: s.id, k }); });
    const assign: number[][] = slots.map((s) => Array(tasks[s.task].req).fill(-1));
    let best: { cost: number; assign: number[][] } | null = null;
    const partialOk = (p: number) => {
        const l: Slot[] = []; slots.forEach((s, i) => { if (assign[i].includes(p)) l.push(s); });
        l.sort((a, b) => a.start - b.start);
        for (const s of l) if (onLeave(people[p], s)) return false;
        for (let i = 1; i < l.length; i++) if (l[i].start - l[i - 1].end < cfg.minRest - 1e-9) return false;
        return true;
    };
    const rec = (i: number) => {
        if (i === pos.length) {
            const per: Slot[][] = people.map(() => []);
            slots.forEach((s, j) => assign[j].forEach((p) => per[p].push(s)));
            per.forEach((l) => l.sort((a, b) => a.start - b.start));
            const c = costOf(cfg, ctx, per); if (!best || c < best.cost) best = { cost: c, assign: assign.map((a) => a.slice()) }; return;
        }
        const q = pos[i];
        for (let p = 0; p < people.length; p++) {
            if (assign[q.slot].includes(p)) continue;
            assign[q.slot][q.k] = p;
            if (partialOk(p)) rec(i + 1);
            assign[q.slot][q.k] = -1;
        }
    };
    rec(0);
    return best;
}
