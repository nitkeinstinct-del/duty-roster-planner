# Duty roster prototype: Python server variant

This branch preserves the other live sites and adds a separate server deployment.
Run `python3 server.py` with Python 3.10+ (no external packages). It binds to
0.0.0.0 on PORT (default 8000). In Render select branch `server-engine`, Python,
Free instance, build command `true`, start command `python3 server.py`.
No database, persistent disk or paid service is required.

`server.py` serves a compressed, prebuilt React UI embedded in the file. Its UI
calls POST /api/solve. All roster computation runs in a Python server process;
there is no Pyodide or browser solver in that UI. GET /api/health returns
`{"ok": true, "engine": "python-server"}`. The Python engine remains in
public/roster_engine.py. The inherited src/ directory is the old browser variant
and is not used by the server deployment. The updated UI source is 3-ui-source.zip.
Rebuild that source with npm ci and npm run build, then regenerate the embedded
UI in server.py using embed-ui.py. No Node build is needed on Render.

## Boundaries
This is an experimental heuristic, not a proven-optimal or operational system.
Only fictional sample data is appropriate. Full coverage, presence, no overlap,
and max(previous rest-after, next rest-before, global rest) remain hard rules.
There is no rest validation outside the schedule horizon. Night and one-off
windows, fairness and leave inputs follow the existing Python engine.

Inputs are saved in browser localStorage and sent over HTTPS to Render for each
calculation. Application code does not persist input or output or log their
contents. Hosting-provider infrastructure may process traffic and metadata.
No login or multi-device sync is implemented. Do not enter real personnel or
operational information. This public endpoint can be used by anyone.

The API rejects malformed fields rather than truncating names or changing dates.
Limits: 256 KiB body, 31 days, 200 people, 100 tasks, 2000 shifts, 5000 positions,
80000 iterations. Two concurrent calculations, no waiting queue; each computation
is terminated after 45 seconds. Oversized requests receive an error, not a partial
valid result. This is basic prototype protection, not a production security audit.

Render free instances sleep after 15 idle minutes and can take roughly one minute
to wake: https://render.com/docs/free . Deployment is not yet live: signup was
blocked by a CAPTCHA. No payment has been authorized.

## Tests
python3 tests/test_engine.py (17 existing engine tests).
python3 tests/test_server.py (five API validation and HTTP tests in the source archive).
