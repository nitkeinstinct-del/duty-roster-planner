"""Engine tests for the Python roster engine (branch python-engine).

Run with the standard library only:  python3 tests/test_engine.py
Port of tests/engine.test.mts from the main (TypeScript) branch.
"""
import math
import sys
import time

sys.path.insert(0, 'public')
sys.path.insert(0, '../public')
import roster_engine as E  # noqa: E402

n = 0


def ok(name, f):
    global n
    f()
    n += 1
    print('ok -', name)


def mk(k):
    return [{'name': 'P%d' % (i + 1), 'leave': []} for i in range(k)]


def T(name, req, frm=0, to=24, shift_len=8, days=None):
    return {'name': name, 'req': req, 'from': frm, 'to': to, 'shiftLen': shift_len, 'days': days}


def cfg(**kw):
    c = E.default_config()
    c.update(kw)
    return c


def test_continuous():
    people = mk(12)
    people[0]['leave'] = [2, 3]
    people[1]['leave'] = [5]
    tasks = [T('Gate', 2), T('Control', 1)]
    c = cfg(days=14)
    r = E.solve(c, people, tasks)
    assert r['feasibility'] == 'full'
    assert r['violations'] == []
    assert E.validate(c, people, tasks, r['slots'], r['assign']) == []
    assert sum(E.dur(s) for s in r['slots'] if s['task'] == 0) == 14 * 24


ok('24/7 task is one continuous timeline, fully covered, no violations', test_continuous)


def test_windows():
    tasks = [T('Morning', 1, 6.5, 11, 4.5), T('Night', 1, 22, 6, 8), T('Once', 2, 14, 17.5, 3.5, [3])]
    slots = E.build_slots(cfg(days=5), tasks)
    m = [s for s in slots if s['task'] == 0]
    nt = [s for s in slots if s['task'] == 1]
    o = [s for s in slots if s['task'] == 2]
    assert len(m) == 5 and m[0]['start'] == 6.5 and m[0]['end'] == 11
    assert len(nt) == 5 and nt[0]['start'] == 22 and nt[0]['end'] == 30
    assert len(o) == 1 and o[0]['start'] == 3 * 24 + 14 and o[0]['end'] == 3 * 24 + 17.5
    r = E.solve(cfg(days=5), mk(8), tasks)
    assert r['feasibility'] == 'full'
    assert r['violations'] == []


ok('arbitrary clock windows: 06:30-11:00, 22:00-06:00 crossing midnight, one-off day 4 14:00-17:30', test_windows)

def assert_windows_clipped():
    s = E.build_slots(cfg(days=1), [T('X', 1, 8, 19, 4)])
    assert [[x['start'], x['end']] for x in s] == [[8, 12], [12, 16], [16, 19]]


ok('shift longer than window is clipped; short remainder shift allowed', assert_windows_clipped)


def test_night_hours():
    assert E.night_hours(20, 28) == 6
    assert E.night_hours(8, 16) == 0
    assert E.night_hours(0, 24) == 8


ok('night hours overlap with 22:00-06:00', test_night_hours)


def test_fairness():
    r = E.solve(cfg(days=14, balance=1), mk(10), [T('A', 2)])
    hs = [s['hours'] for s in r['stats']]
    assert max(hs) - min(hs) <= 16, hs


ok('fairness: hours spread within 2 shifts for equal people', test_fairness)


def test_absent():
    p = mk(9)
    p[0]['leave'] = [0, 1, 2, 3, 4, 5, 6]
    r = E.solve_max_rest(cfg(days=7), p, [T('A', 2)])
    assert r['feasibility'] == 'full'
    assert r['stats'][0]['hours'] == 0


ok('absent people are never scheduled on those days and get less load', test_absent)


def test_infeasible():
    r = E.solve(cfg(days=3), mk(2), [T('A', 3)])
    assert r['feasibility'] == 'proven-infeasible'
    assert len(r['reason']) > 0
    r2 = E.solve(cfg(days=5, minRest=8), mk(3), [T('A', 2)])
    assert r2['feasibility'] == 'proven-infeasible'
    r3 = E.solve(cfg(days=5, minRest=8), mk(4), [T('A', 2)])
    assert r3['feasibility'] in ('full', 'not-found')


ok('infeasible only claimed when proven; otherwise not-found', test_infeasible)


def test_deterministic():
    p = mk(9)
    t = [T('A', 2)]
    assert E.solve(cfg(seed=5), p, t)['assign'] == E.solve(cfg(seed=5), p, t)['assign']


ok('deterministic for a given seed', test_deterministic)


def test_max_rest():
    p = mk(12)
    t = [T('A', 2)]
    base = E.solve(cfg(days=10), p, t)
    best = E.solve_max_rest(cfg(days=10), p, t)
    mg = lambda r: min(s['minGap'] if s['minGap'] is not None else 99 for s in r['stats'])
    print('   min rest: baseline %sh, max-rest %sh (hard min %sh)' % (mg(base), mg(best), best['minRestUsed']))
    assert best['feasibility'] == 'full'
    assert mg(best) >= mg(base)
    assert best['violations'] == []


ok('max-rest search gives at least baseline minimum rest', test_max_rest)


def test_vs_optimum():
    c = cfg(days=2, minRest=0, comfortRest=12, balance=0.7, iterations=20000)
    people = mk(4)
    tasks = [T('A', 1, 0, 24, 12), T('B', 1, 8, 20, 6)]
    opt = E.brute_force(c, people, tasks)
    h = E.solve(c, people, tasks)
    print('   optimum cost %.3f, heuristic cost %.3f' % (opt['cost'], h['cost']))
    assert h['cost'] >= opt['cost'] - 1e-9
    assert h['cost'] <= opt['cost'] + 1e-6


ok('heuristic vs exhaustive optimum on a tiny instance', test_vs_optimum)


def test_required_gap():
    c = cfg(minRest=8)
    tasks = [
        {'name': 'A', 'req': 1, 'from': 8, 'to': 16, 'shiftLen': 8, 'restAfter': 10},
        {'name': 'B', 'req': 1, 'from': 18, 'to': 24, 'shiftLen': 6, 'restBefore': 4},
    ]
    slots = E.build_slots(cfg(days=1, minRest=8), tasks)
    a, b = slots
    assert E.required_gap(c, tasks, a, b) == 10   # max(8, 10, 4)
    assert E.required_gap(c, tasks, b, a) == 8    # reversed: max(8, B.restAfter=0, A.restBefore=0)
    c20 = cfg(minRest=20)
    assert E.required_gap(c20, tasks, a, b) == 20  # global floor still applies
    plain = [T('X', 1), T('Y', 1)]
    s2 = E.build_slots(cfg(days=1), plain)
    assert E.required_gap(c, plain, s2[0], s2[1]) == 8  # tasks without rest fields = old behaviour


ok('requiredGap: larger of prev restAfter, next restBefore, global minRest - directional, never a sum', test_required_gap)


def test_rest_after_enforced():
    c = cfg(days=1, minRest=0)

    def mkt(rest_after):
        return [
            {'name': 'A', 'req': 1, 'from': 8, 'to': 16, 'shiftLen': 8, 'restAfter': rest_after},
            {'name': 'B', 'req': 1, 'from': 18, 'to': 24, 'shiftLen': 6},
        ]
    tasks = mkt(10)
    slots = E.build_slots(c, tasks)
    v = E.validate(c, [{'name': 'P1', 'leave': []}], tasks, slots, [[0], [0]])
    assert len(v) == 1 and '10' in v[0]
    tasks = mkt(2)
    v = E.validate(c, [{'name': 'P1', 'leave': []}], tasks, slots, [[0], [0]])
    assert v == []  # gap 2h >= restAfter 2h


ok('rest-after is enforced: validate flags a too-short gap and clears when the requirement drops', test_rest_after_enforced)


def test_no_sum():
    c = cfg(days=2, minRest=0)
    tasks = [
        {'name': 'A', 'req': 1, 'from': 8, 'to': 16, 'shiftLen': 8, 'restAfter': 6, 'days': [0]},
        {'name': 'B', 'req': 1, 'from': 24, 'to': 6, 'shiftLen': 6, 'restBefore': 6, 'days': [0]},
    ]
    slots = E.build_slots(c, tasks)
    assert len(slots) == 2
    assert slots[1]['start'] - slots[0]['end'] == 8
    assert E.validate(c, [{'name': 'P1', 'leave': []}], tasks, slots, [[0], [0]]) == []  # sum would be 12


ok('rest values do not add up: gap 8h passes restAfter 6 + restBefore 6 (larger-of only)', test_no_sum)


def test_rest_before_midnight():
    c = cfg(days=2, minRest=0)

    def mkt(rest_before):
        return [
            {'name': 'Day', 'req': 1, 'from': 8, 'to': 20, 'shiftLen': 12, 'days': [0]},
            {'name': 'Night', 'req': 1, 'from': 22, 'to': 6, 'shiftLen': 8, 'restBefore': rest_before, 'days': [0]},
        ]
    tasks = mkt(6)
    slots = E.build_slots(c, tasks)
    v = E.validate(c, [{'name': 'P1', 'leave': []}], tasks, slots, [[0], [0]])
    assert len(v) == 1  # gap 2h < restBefore 6h
    tasks = mkt(2)
    v = E.validate(c, [{'name': 'P1', 'leave': []}], tasks, slots, [[0], [0]])
    assert v == []


ok('rest-before applies across midnight (window crossing into the next day)', test_rest_before_midnight)


def test_solver_respects_rest():
    c = cfg(days=2, minRest=0)
    tasks = [{'name': 'Gate', 'req': 1, 'from': 0, 'to': 24, 'shiftLen': 8, 'restAfter': 12}]
    ppl = [{'name': 'P1', 'leave': []}, {'name': 'P2', 'leave': []}, {'name': 'P3', 'leave': []}]
    r = E.solve(c, ppl, tasks)
    assert r['feasibility'] == 'full'
    assert r['violations'] == []
    assert E.validate(c, ppl, tasks, r['slots'], r['assign']) == []
    mg = min(s['minGap'] if s['minGap'] is not None else 99 for s in r['stats'])
    assert mg >= 12, 'min gap %s < 12' % mg


ok('solver respects per-task rest-after on a 24/7 task and still covers fully', test_solver_respects_rest)


def test_rest_counting_proof():
    c = cfg(days=3, minRest=0)
    tasks = [{'name': 'Gate', 'req': 1, 'from': 0, 'to': 24, 'shiftLen': 8, 'restAfter': 12}]
    r = E.solve(c, [{'name': 'P1', 'leave': []}, {'name': 'P2', 'leave': []}], tasks)
    assert r['feasibility'] == 'proven-infeasible'
    assert '12' in r['reason']


ok('per-task rest feeds the counting proof: too few people with big rest-after is proven infeasible', test_rest_counting_proof)


def test_solve_json_roundtrip():
    import json
    payload = json.dumps({'cfg': cfg(days=3), 'people': mk(8),
                          'tasks': [T('Gate', 1)], 'maxRest': False})
    out = json.loads(E.solve_json(payload))
    assert out['engine'] == 'python-pyodide'
    assert out['feasibility'] == 'full'
    assert out['violations'] == []


ok('solve_json: browser worker entry point returns JSON with engine marker', test_solve_json_roundtrip)

print('%d tests passed' % n)
