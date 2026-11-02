# Duty roster planner (prototype)
Hebrew web app prototype for a 24/7 duty roster. Fictional sample data only.
- Only people present at the base are scheduled. Absence days are an input; the app does not decide leave.
- Tasks can be 24/7, night-only (or any shift subset), or one-off (specific days).
- Full coverage is mandatory. A partial schedule is shown as INVALID, never as a result.
- Then it maximises minimum rest between shifts per person, with a fairness slider.
- Heuristic (greedy + simulated annealing), not proven optimal. "Proven infeasible" is only claimed from counting arguments; otherwise "not found".
Run tests: node --experimental-strip-types tests/engine.test.mts
