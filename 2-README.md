# Duty roster planner (prototype) - `python-engine` branch

Hebrew (RTL) web app that builds a duty roster. Runs entirely in the browser. Fictional sample data only.

**This branch replaces the TypeScript scheduling engine with a Python one.** The UI is the same React
app, but there is no TypeScript solver here at all: every roster is computed by
`public/roster_engine.py`, running inside [Pyodide](https://pyodide.org/) (CPython compiled to
WebAssembly) in a module web worker (`public/pyworker.mjs`). Pyodide v314.0.7 is loaded from the jsDelivr CDN,
so the FIRST load needs an internet connection (a few MB, cached afterwards). If the Python engine
fails to load or run, the app shows an explicit error - it never silently falls back to another solver.
The deployed site on `main` is unchanged and still uses the TypeScript engine.

## What it does
- Plans only people who are at the base. Days a person is not at base are an input; the app does not decide leave.
- Tasks: 24/7 continuous, a clock window (from/to, may cross midnight, e.g. 22:00-06:00), or one-off on specific days. Each task has people per shift and a shift length.
- Per-task mandatory rest: each task can require hours of rest before it starts and after it ends. Between two consecutive shifts of the same person the required gap is the LARGER of the previous task's rest-after, the next task's rest-before and the global minimum rest - never their sum. This is a hard rule checked by the independent validator, like leave and overlap.
- Full coverage is mandatory. A partial roster is shown as INVALID and never as a result.
- After coverage, it maximises the minimum rest between shifts for each person, with a fairness slider.
- "Proven infeasible" is shown only when a counting argument proves it. Otherwise the app says the search did not find a full roster, which is not proof that none exists.

## Method (honest limits)
Greedy construction plus simulated annealing, with a separate hard-rule validator - same algorithm as
`main`, ported line by line. This is a heuristic. It does not prove that a roster is optimal for
fairness or rest, and the Python port does not change that.
Shift windows are cut into fixed-length shifts; there are no limits on consecutive days and no per-task qualifications yet.
Rest before the first shift of the horizon and after the last shift is NOT checked: the planner has no data about duties outside the planned days, so those edges cannot be verified.
The port keeps the per-person cost cached and incremental (instead of rebuilding it on every move) so
the annealing loop stays fast enough in interpreted WebAssembly Python; the cost function and the
constraint semantics are identical to `main`.

## Run
Needs Node 22.6 or newer for the UI, and Python 3 for the engine tests (standard library only).

    npm ci
    npm run dev        # local dev server
    npm run build      # typecheck + production build into dist/
    npm test           # Python engine tests (python3 tests/test_engine.py)

## Data and persistence
Input is saved in this browser's localStorage under the key `roster-input.v1` (see `src/useLocalStorage.ts`). It is never sent anywhere, is not synced between devices, and is lost if browser data is cleared. Use fictional names or nicknames, not real personnel data.

## Deployment
There is intentionally **no** `.github/workflows/deploy.yml` on this branch, so pushing or dispatching
here can never deploy to GitHub Pages. The live site <https://nitkeinstinct-del.github.io/duty-roster-planner/>
is deployed from `main` only. To try this branch, run it locally (`npm run dev`, or `npm run build`
and serve `dist/` with any static file server).
