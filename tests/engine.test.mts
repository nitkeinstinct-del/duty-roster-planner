import assert from 'node:assert/strict';
import { solve, bruteForce, validate, defaultConfig, buildSlots, type Person, type Task } from '../src/engine.ts';

import { solveMaxRest, nightHours, dur, requiredGap } from '../src/engine.ts';
let n = 0; const ok = (name: string, f: () => void) => { f(); n++; console.log('ok -', name); };
const mk = (k: number): Person[] => Array.from({ length: k }, (_, i) => ({ name: 'P' + (i + 1), leave: [] }));
const T = (name: string, req: number, from = 0, to = 24, shiftLen = 8, days?: number[]): Task => ({ name, req, from, to, shiftLen, days });

ok('24/7 task is one continuous timeline, fully covered, no violations', () => {
    const people = mk(12); people[0].leave = [2, 3]; people[1].leave = [5];
    const tasks = [T('Gate', 2), T('Control', 1)];
    const cfg = { ...defaultConfig, days: 14 };
    const r = solve(cfg, people, tasks);
    assert.equal(r.feasibility, 'full'); assert.deepEqual(r.violations, []);
    assert.deepEqual(validate(cfg, people, tasks, r.slots, r.assign), []);
    assert.equal(r.slots.filter((s) => s.task === 0).reduce((a, s) => a + dur(s), 0), 14 * 24);
});
ok('arbitrary clock windows: 06:30-11:00, 22:00-06:00 crossing midnight, one-off day 4 14:00-17:30', () => {
    const tasks = [T('Morning', 1, 6.5, 11, 4.5), T('Night', 1, 22, 6, 8), T('Once', 2, 14, 17.5, 3.5, [3])];
    const slots = buildSlots({ ...defaultConfig, days: 5 }, tasks);
    const m = slots.filter((s) => s.task === 0), nt = slots.filter((s) => s.task === 1), o = slots.filter((s) => s.task === 2);
    assert.equal(m.length, 5); assert.equal(m[0].start, 6.5); assert.equal(m[0].end, 11);
    assert.equal(nt.length, 5); assert.equal(nt[0].start, 22); assert.equal(nt[0].end, 30);
    assert.equal(o.length, 1); assert.equal(o[0].start, 3 * 24 + 14); assert.equal(o[0].end, 3 * 24 + 17.5);
    const r = solve({ ...defaultConfig, days: 5 }, mk(8), tasks);
    assert.equal(r.feasibility, 'full'); assert.deepEqual(r.violations, []);
});
ok('shift longer than window is clipped; short remainder shift allowed', () => {
    const s = buildSlots({ ...defaultConfig, days: 1 }, [T('X', 1, 8, 19, 4)]);
    assert.deepEqual(s.map((x) => [x.start, x.end]), [[8, 12], [12, 16], [16, 19]]);
});
ok('night hours overlap with 22:00-06:00', () => { assert.equal(nightHours(20, 28), 6); assert.equal(nightHours(8, 16), 0); assert.equal(nightHours(0, 24), 8); });
ok('fairness: hours spread within 2 shifts for equal people', () => {
    const r = solve({ ...defaultConfig, days: 14, balance: 1 }, mk(10), [T('A', 2)]);
    const hs = r.stats.map((s) => s.hours); assert.ok(Math.max(...hs) - Math.min(...hs) <= 16, hs.join());
});
ok('absent people are never scheduled on those days and get less load', () => {
    const p = mk(9); p[0].leave = [0, 1, 2, 3, 4, 5, 6];
    const r = solveMaxRest({ ...defaultConfig, days: 7 }, p, [T('A', 2)]);
    assert.equal(r.feasibility, 'full'); assert.equal(r.stats[0].hours, 0);
});
ok('infeasible only claimed when proven; otherwise not-found', () => {
    const r = solve({ ...defaultConfig, days: 3 }, mk(2), [T('A', 3)]);
    assert.equal(r.feasibility, 'proven-infeasible'); assert.ok(r.reason.length > 0);
    const r2 = solve({ ...defaultConfig, days: 5, minRest: 8 }, mk(3), [T('A', 2)]);
    assert.equal(r2.feasibility, 'proven-infeasible');
    const r3 = solve({ ...defaultConfig, days: 5, minRest: 8 }, mk(4), [T('A', 2)]);
    assert.ok(['full', 'not-found'].includes(r3.feasibility));
});
ok('deterministic for a given seed', () => {
    const p = mk(9), t = [T('A', 2)];
    assert.deepEqual(solve({ ...defaultConfig, seed: 5 }, p, t).assign, solve({ ...defaultConfig, seed: 5 }, p, t).assign);
});
ok('max-rest search gives at least baseline minimum rest', () => {
    const p = mk(12), t = [T('A', 2)];
    const base = solve({ ...defaultConfig, days: 10 }, p, t), best = solveMaxRest({ ...defaultConfig, days: 10 }, p, t);
    const mg = (r: typeof base) => Math.min(...r.stats.map((s) => s.minGap ?? 99));
    console.log(`   min rest: baseline ${mg(base)}h, max-rest ${mg(best)}h (hard min ${best.minRestUsed}h)`);
    assert.equal(best.feasibility, 'full'); assert.ok(mg(best) >= mg(base)); assert.deepEqual(best.violations, []);
});
ok('heuristic vs exhaustive optimum on a tiny instance', () => {
    const cfg = { ...defaultConfig, days: 2, minRest: 0, comfortRest: 12, balance: 0.7, iterations: 20000 };
    const people = mk(4), tasks = [T('A', 1, 0, 24, 12), T('B', 1, 8, 20, 6)];
    const opt = bruteForce(cfg, people, tasks)!; const h = solve(cfg, people, tasks);
    console.log(`   optimum cost ${opt.cost.toFixed(3)}, heuristic cost ${h.cost.toFixed(3)}`);
    assert.ok(h.cost >= opt.cost - 1e-9); assert.ok(h.cost <= opt.cost + 1e-6);
});
ok('requiredGap: larger of prev restAfter, next restBefore, global minRest - directional, never a sum', () => {
    const cfg = { ...defaultConfig, minRest: 8 };
    const tasks: Task[] = [
        { name: 'A', req: 1, from: 8, to: 16, shiftLen: 8, restAfter: 10 },
        { name: 'B', req: 1, from: 18, to: 24, shiftLen: 6, restBefore: 4 },
    ];
    const slots = buildSlots({ ...cfg, days: 1 }, tasks);
    const [a, b] = slots;
    assert.equal(requiredGap(cfg, tasks, a, b), 10); // max(8, 10, 4)
    assert.equal(requiredGap(cfg, tasks, b, a), 8);  // reversed direction: max(8, B.restAfter=0, A.restBefore=0)
    assert.equal(requiredGap({ ...cfg, minRest: 20 }, tasks, a, b), 20); // global floor still applies
    const plain: Task[] = [T('X', 1), T('Y', 1)];
    const s2 = buildSlots({ ...cfg, days: 1 }, plain);
    assert.equal(requiredGap(cfg, plain, s2[0], s2[1]), 8); // tasks without rest fields = old behaviour
});

ok('rest-after is enforced: validate flags a too-short gap and clears when the requirement drops', () => {
    const cfg = { ...defaultConfig, days: 1, minRest: 0 };
    const mk = (restAfter: number): Task[] => [
        { name: 'A', req: 1, from: 8, to: 16, shiftLen: 8, restAfter },
        { name: 'B', req: 1, from: 18, to: 24, shiftLen: 6 },
    ];
    let tasks = mk(10);
    let slots = buildSlots(cfg, tasks);
    let v = validate(cfg, [{ name: 'P1', leave: [] }], tasks, slots, [[0], [0]]);
    assert.equal(v.length, 1); assert.ok(v[0].includes('10'));
    tasks = mk(2);
    v = validate(cfg, [{ name: 'P1', leave: [] }], tasks, slots, [[0], [0]]);
    assert.deepEqual(v, []); // gap 2h >= restAfter 2h
});

ok('rest values do not add up: gap 8h passes restAfter 6 + restBefore 6 (larger-of only)', () => {
    const cfg = { ...defaultConfig, days: 2, minRest: 0 };
    const tasks: Task[] = [
        { name: 'A', req: 1, from: 8, to: 16, shiftLen: 8, restAfter: 6, days: [0] },
        { name: 'B', req: 1, from: 24, to: 6, shiftLen: 6, restBefore: 6, days: [0] }, // slot 24-30
    ];
    const slots = buildSlots(cfg, tasks);
    assert.equal(slots.length, 2);
    assert.equal(slots[1].start - slots[0].end, 8);
    assert.deepEqual(validate(cfg, [{ name: 'P1', leave: [] }], tasks, slots, [[0], [0]]), []); // sum would be 12
});

ok('rest-before applies across midnight (window crossing into the next day)', () => {
    const cfg = { ...defaultConfig, days: 2, minRest: 0 };
    const mk = (restBefore: number): Task[] => [
        { name: 'Day', req: 1, from: 8, to: 20, shiftLen: 12, days: [0] },
        { name: 'Night', req: 1, from: 22, to: 6, shiftLen: 8, restBefore, days: [0] }, // slot 22-30
    ];
    let tasks = mk(6);
    const slots = buildSlots(cfg, tasks);
    let v = validate(cfg, [{ name: 'P1', leave: [] }], tasks, slots, [[0], [0]]);
    assert.equal(v.length, 1); // gap 2h < restBefore 6h
    tasks = mk(2);
    v = validate(cfg, [{ name: 'P1', leave: [] }], tasks, slots, [[0], [0]]);
    assert.deepEqual(v, []);
});

ok('solver respects per-task rest-after on a 24/7 task and still covers fully', () => {
    const cfg = { ...defaultConfig, days: 2, minRest: 0 };
    const tasks: Task[] = [{ name: 'Gate', req: 1, from: 0, to: 24, shiftLen: 8, restAfter: 12 }];
    const r = solve(cfg, [{ name: 'P1', leave: [] }, { name: 'P2', leave: [] }, { name: 'P3', leave: [] }], tasks);
    assert.equal(r.feasibility, 'full'); assert.deepEqual(r.violations, []);
    assert.deepEqual(validate(cfg, [{ name: 'P1', leave: [] }, { name: 'P2', leave: [] }, { name: 'P3', leave: [] }], tasks, r.slots, r.assign), []);
    const mg = Math.min(...r.stats.map((s) => s.minGap ?? 99));
    assert.ok(mg >= 12, `min gap ${mg} < 12`);
});

ok('per-task rest feeds the counting proof: too few people with big rest-after is proven infeasible', () => {
    const cfg = { ...defaultConfig, days: 3, minRest: 0 };
    const tasks: Task[] = [{ name: 'Gate', req: 1, from: 0, to: 24, shiftLen: 8, restAfter: 12 }];
    const r = solve(cfg, [{ name: 'P1', leave: [] }, { name: 'P2', leave: [] }], tasks);
    assert.equal(r.feasibility, 'proven-infeasible'); assert.ok(r.reason.includes('12'));
});
console.log(n + ' tests passed');
