# Duty roster planner (prototype)

Hebrew (RTL) web app that builds a duty roster. Runs entirely in the browser. Fictional sample data only.

## What it does
- Plans only people who are at the base. Days a person is not at base are an input; the app does not decide leave.
- Tasks: 24/7 continuous, a clock window (from/to, may cross midnight, e.g. 22:00-06:00), or one-off on specific days. Each task has people per shift and a shift length.
- Full coverage is mandatory. A partial roster is shown as INVALID and never as a result.
- After coverage, it maximises the minimum rest between shifts for each person, with a fairness slider.
- "Proven infeasible" is shown only when a counting argument proves it. Otherwise the app says the search did not find a full roster, which is not proof that none exists.

## Method (honest limits)
Greedy construction plus simulated annealing, with a separate hard-rule validator. This is a heuristic. It does not prove that a roster is optimal for fairness or rest.
Shift windows are cut into fixed-length shifts; there are no limits on consecutive days and no per-task qualifications yet.

## Run
Needs Node 22.6 or newer.

    npm ci
    npm run dev        # local dev server
    npm run build      # typecheck + production build into dist/
    npm test           # engine tests (node --experimental-strip-types)

## Data and persistence
Input is saved in this browser's localStorage under the key `roster-input.v1` (see `src/useLocalStorage.ts`). It is never sent anywhere, is not synced between devices, and is lost if browser data is cleared. Use fictional names or nicknames, not real personnel data.

## Deployment
This repository is source only. It is not deployed anywhere. The same engine also runs in a private hosted prototype File on Instinct that uses the platform's own local-state hook instead of `src/useLocalStorage.ts`; that hosted File is separate from this repo.
