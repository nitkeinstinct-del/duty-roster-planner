# Duty roster planner (prototype)

Hebrew (RTL) web app that builds a duty roster. Runs entirely in the browser. Fictional sample data only.

## What it does
- Plans only people who are at the base. Days a person is not at base are an input; the app does not decide leave.
- Tasks: 24/7 continuous, a clock window (from/to, may cross midnight, e.g. 22:00-06:00), or one-off on specific days. Each task has people per shift and a shift length.
- Per-task mandatory rest: each task can require hours of rest before it starts and after it ends. Between two consecutive shifts of the same person the required gap is the LARGER of the previous task's rest-after, the next task's rest-before and the global minimum rest - never their sum. This is a hard rule checked by the independent validator, like leave and overlap.
- Full coverage is mandatory. A partial roster is shown as INVALID and never as a result.
- After coverage, it maximises the minimum rest between shifts for each person, with a fairness slider.
- "Proven infeasible" is shown only when a counting argument proves it. Otherwise the app says the search did not find a full roster, which is not proof that none exists.

## Method (honest limits)
Greedy construction plus simulated annealing, with a separate hard-rule validator. This is a heuristic. It does not prove that a roster is optimal for fairness or rest.
Shift windows are cut into fixed-length shifts; there are no limits on consecutive days and no per-task qualifications yet.
Rest before the first shift of the horizon and after the last shift is NOT checked: the planner has no data about duties outside the planned days, so those edges cannot be verified.

## Run
Needs Node 22.6 or newer.

    npm ci
    npm run dev        # local dev server
    npm run build      # typecheck + production build into dist/
    npm test           # engine tests (node --experimental-strip-types)

## Data and persistence
Input is saved in this browser's localStorage under the key `roster-input.v1` (see `src/useLocalStorage.ts`). It is never sent anywhere, is not synced between devices, and is lost if browser data is cleared. Use fictional names or nicknames, not real personnel data.

## Deployment
The app is deployed with GitHub Pages (GitHub Actions workflow `.github/workflows/deploy.yml`): <https://nitkeinstinct-del.github.io/duty-roster-planner/>
The same engine also runs in a private hosted prototype File on Instinct that uses the platform's own local-state hook instead of `src/useLocalStorage.ts`; that hosted File is separate from this repo.
