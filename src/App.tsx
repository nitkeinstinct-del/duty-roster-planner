import React, { useMemo, useState } from 'react';
import { Callout, Caption, Closing, FileCard, Group, Header, useLocalState } from '@instinct/files';
import './style.css';
import { defaultConfig, solve, solveMaxRest, type Config, type Person, type Task } from './engine';

type TaskRow = { name: string; req: number; allDay: boolean; from: string; to: string; shiftLen: number; daysText: string };

const SAMPLE_PEOPLE = `דנה: 3,4,5
יוסי: 8,9
מיכל
אורי
נועה: 11,12,13
עומר
רוני: 1,2
תמר
גל
איתי: 6,7
ליאור
שירה: 10,11
אלון
מאיה
עידו: 2,3
הדר`;
const SAMPLE_TASKS: TaskRow[] = [
    { name: 'שער', req: 2, allDay: true, from: '00:00', to: '00:00', shiftLen: 8, daysText: '' },
    { name: 'חמ"ל', req: 1, allDay: true, from: '00:00', to: '00:00', shiftLen: 8, daysText: '' },
    { name: 'סיור לילה', req: 1, allDay: false, from: '22:00', to: '06:00', shiftLen: 8, daysText: '' },
    { name: 'משימה חד-פעמית', req: 2, allDay: false, from: '14:00', to: '17:30', shiftLen: 3.5, daysText: '4' },
];
const WEEKDAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
const hh = (t: string) => { const [h, m] = t.split(':').map(Number); return (h || 0) + (m || 0) / 60; };
const fmt = (x: number) => { const m = Math.round((x % 24) * 60); return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

function parsePeople(t: string): Person[] {
    return t.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
        const [name, rest = ''] = l.split(':');
        return { name: name.trim(), leave: rest.split(/[ ,]+/).map((x) => parseInt(x, 10)).filter((x) => !isNaN(x)).map((x) => x - 1) };
    });
}

export function App() {
    type Saved = { peopleText: string; taskRows: TaskRow[]; maxRest: boolean; cfg: Config };
    const [st, setSt, saved] = useLocalState<Saved>('roster-input.v1', { peopleText: SAMPLE_PEOPLE, taskRows: SAMPLE_TASKS, maxRest: true, cfg: { ...defaultConfig } });
    const { peopleText, taskRows, maxRest, cfg } = st;
    const edit = (patch: Partial<Saved>) => { if (saved.ready) setSt({ ...st, ...patch }); };
    const setPeople = (v: string) => edit({ peopleText: v });
    const setTaskRows = (f: (r: TaskRow[]) => TaskRow[]) => edit({ taskRows: f(taskRows) });
    const setMaxRest = (v: boolean) => edit({ maxRest: v });
    const [run, setRun] = useState(0);
    const people = useMemo(() => parsePeople(peopleText), [peopleText]);
    const tasks: Task[] = useMemo(() => taskRows.filter((t) => t.name.trim()).map((t) => ({
        name: t.name.trim(), req: Math.max(1, Math.min(10, t.req || 1)), shiftLen: Math.max(0.5, t.shiftLen || 8),
        from: t.allDay ? 0 : hh(t.from), to: t.allDay ? 24 : (hh(t.to) === hh(t.from) ? hh(t.from) + 24 : hh(t.to)),
        days: t.daysText.trim() ? t.daysText.split(/[ ,]+/).map((x) => parseInt(x, 10) - 1).filter((x) => !isNaN(x)) : undefined,
    })).map((t) => ({ ...t, to: t.to > 24 && t.from === 0 && !t.days ? 24 : t.to })), [taskRows]);
    const result = useMemo(() => (people.length && tasks.length ? (maxRest ? solveMaxRest(cfg, people, tasks) : solve(cfg, people, tasks)) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [people, tasks, cfg, run, maxRest]);
    const set = (k: keyof Config, v: number) => edit({ cfg: { ...cfg, [k]: v } });
    const upd = (i: number, patch: Partial<TaskRow>) => setTaskRows((r) => r.map((t, j) => (j === i ? { ...t, ...patch } : t)));

    return <FileCard>
        <div dir="rtl" className="rp">
            <Header title="שיבוץ משמרות 24/7" fact="אב-טיפוס עם נתונים לדוגמה" intro="מזינים את מי שנמצא בבסיס ומשימות עם שעות מדויקות (24/7, חלון שעות, לילה או חד-פעמיות), והאפליקציה בונה שיבוץ עם כיסוי מלא וכמה שיותר מנוחה." />
            <Callout title="שיטה: היוריסטיקה, לא אופטימום מוכח" tone="warning">החישוב הוא שיפור הדרגתי (חמדני + חישול מדומה). כללים קשיחים נבדקים בנפרד, אבל איכות החלוקה והמנוחה אינה מוכחת כמיטבית. שיבוץ בלי כיסוי מלא מסומן כלא תקין. שמות הדוגמה בדויים.</Callout>

            <Group label="קלט" heading>
                <label className="rp-l">רק מי שנמצא בבסיס, אחד בכל שורה. אחרי נקודתיים: ימים שהוא לא בבסיס (קלט בלבד, האפליקציה לא מחליטה על יציאות)
                    <textarea className="rp-t" rows={8} value={peopleText} onChange={(e) => setPeople(e.target.value)} />
                </label>
                <div className="rp-l">משימות. לכל משימה: כמה אנשים, שעות פעילות מדויקות, אורך משמרת, וימים (ריק = כל הימים)
                    {taskRows.map((t, i) => <div key={i} className="rp-task">
                        <input className="rp-i" aria-label="שם משימה" value={t.name} onChange={(e) => upd(i, { name: e.target.value })} />
                        <label className="rp-sm">אנשים <input className="rp-i rp-n" type="number" min={1} max={10} value={t.req} onChange={(e) => upd(i, { req: +e.target.value })} /></label>
                        <label className="rp-sm"><input type="checkbox" checked={t.allDay} onChange={(e) => upd(i, { allDay: e.target.checked })} /> 24/7 ברצף</label>
                        {!t.allDay && <><label className="rp-sm">מ-<input className="rp-i" type="time" value={t.from} onChange={(e) => upd(i, { from: e.target.value })} /></label>
                            <label className="rp-sm">עד <input className="rp-i" type="time" value={t.to} onChange={(e) => upd(i, { to: e.target.value })} /></label></>}
                        <label className="rp-sm">אורך משמרת (שעות) <input className="rp-i rp-n" type="number" min={0.5} max={24} step={0.5} value={t.shiftLen} onChange={(e) => upd(i, { shiftLen: +e.target.value })} /></label>
                        <label className="rp-sm">ימים <input className="rp-i rp-d" placeholder="הכול" value={t.daysText} onChange={(e) => upd(i, { daysText: e.target.value })} /></label>
                        <button className="file-button is-compact" data-variant="secondary" onClick={() => setTaskRows((r) => r.filter((_, j) => j !== i))}>הסר</button>
                    </div>)}
                    <button className="file-button is-compact" data-variant="secondary" onClick={() => setTaskRows((r) => [...r, { name: 'משימה חדשה', req: 1, allDay: false, from: '08:00', to: '16:00', shiftLen: 8, daysText: '' }])}>הוסף משימה</button>
                </div>
                <div className="rp-grid">
                    <label className="rp-l">ימים בלוח<input className="rp-i" type="number" min={1} max={31} value={cfg.days} onChange={(e) => set('days', Math.max(1, Math.min(31, +e.target.value || 1)))} /></label>
                    <label className="rp-l">מנוחה מינימלית נדרשת (שעות, חובה)<input className="rp-i" type="number" min={0} max={48} value={cfg.minRest} onChange={(e) => set('minRest', Math.max(0, +e.target.value || 0))} /></label>
                    <label className="rp-l">מנוחה רצויה (שעות, העדפה)<input className="rp-i" type="number" min={0} max={72} value={cfg.comfortRest} onChange={(e) => set('comfortRest', Math.max(0, +e.target.value || 0))} /></label>
                    <label className="rp-l">היום בשבוע של יום 1
                        <select className="rp-i" value={cfg.firstWeekday} onChange={(e) => set('firstWeekday', +e.target.value)}>{WEEKDAYS.map((w, i) => <option key={i} value={i}>{w}</option>)}</select></label>
                </div>
                <label className="rp-sm"><input type="checkbox" checked={maxRest} onChange={(e) => setMaxRest(e.target.checked)} /> מקסם את המנוחה המינימלית אוטומטית (כיסוי מלא קודם, אחר כך כמה שיותר מנוחה)</label>
                <label className="rp-l">איזון: מנוחה ארוכה ← → חלוקה שווה ({Math.round(cfg.balance * 100)}% חלוקה שווה)
                    <input type="range" min={0} max={1} step={0.05} value={cfg.balance} onChange={(e) => set('balance', +e.target.value)} /></label>
                <button className="file-button" onClick={() => { set('seed', cfg.seed + 1); setRun(run + 1); }}>שיבוץ חלופי</button>
                <button className="file-button is-compact" data-variant="secondary" onClick={() => edit({ peopleText: SAMPLE_PEOPLE, taskRows: SAMPLE_TASKS, maxRest: true, cfg: { ...defaultConfig } })}>אפס לנתוני הדוגמה</button>
                <Caption>{saved.ready ? 'הקלט נשמר רק בדפדפן הזה, על המכשיר שלך. הוא לא נשלח לשום מקום. מומלץ להשתמש בשמות בדויים או כינויים ולא בפרטי אנשים אמיתיים.' : 'טוען קלט שמור...'} {saved.message}</Caption>
            </Group>

            {result && (() => {
                const valid = result.feasibility === 'full' && result.violations.length === 0;
                const byDay = Array.from({ length: cfg.days }, (_, d) => result.slots.filter((s) => s.day === d));
                const grid = <div className="rp-scroll"><table className="rp-tb">
                    <thead><tr><th>שעות</th><th>משימה</th><th>אנשים</th></tr></thead>
                    <tbody>{byDay.flatMap((list, d) => list.length === 0 ? [] : [
                        <tr key={'h' + d} className="rp-day"><th colSpan={3}>יום {d + 1} ({WEEKDAYS[(cfg.firstWeekday + d) % 7]})</th></tr>,
                        ...list.map((s) => <tr key={s.id}><td dir="ltr">{fmt(s.start)}-{fmt(s.end)}{s.end > (d + 1) * 24 ? ' (+1)' : ''}</td><th>{tasks[s.task].name}</th><td>{result.assign[s.id].map((p) => p < 0 ? '—' : people[p].name).join(', ')}</td></tr>)])}</tbody></table></div>;
                const minRest = Math.min(...result.stats.map((s) => s.minGap ?? Infinity));
                return <>
                    <Group label="תוצאה" heading>
                        {valid
                            ? <Callout title="שיבוץ תקין: כל המשימות מכוסות במלואן">{`נבדק בנפרד: אף אחד לא משובץ ביום שהוא לא בבסיס, אין חפיפות, ואין מנוחה קצרה מ-${result.minRestUsed} שעות.`}</Callout>
                            : <Callout title="אין שיבוץ תקין: הכיסוי אינו מלא" tone="warning">{result.feasibility === 'proven-infeasible' ? `הוכח שאי אפשר לכסות עם הנתונים האלה: ${result.reason}.` : `${result.reason || 'נמצאו הפרות של כללים.'} חסרות ${result.uncovered} עמדות.`} השיבוץ החלקי למטה אינו תקין ואין להשתמש בו. אפשר ללחוץ "שיבוץ חלופי", להוסיף אנשים או לקצר את המנוחה המינימלית.</Callout>}
                        {valid && isFinite(minRest) && <p className="rp-sm">{`המנוחה הקצרה ביותר בין שתי משמרות של אותו אדם: ${Math.round(minRest * 10) / 10} שעות. זו תוצאה של חיפוש היוריסטי: ייתכן ששיבוץ עם יותר מנוחה קיים ולא נמצא.`}</p>}
                        {valid ? grid : <details><summary>הצג שיבוץ חלקי (לא תקין)</summary>{grid}</details>}
                    </Group>
                    {valid && <Group label="חלוקה הוגנת?" heading>
                        <div className="rp-scroll"><table className="rp-tb">
                            <thead><tr><th>שם</th><th>שעות</th><th>יעד</th><th>לילה</th><th>סופ"ש</th><th>מנוחה מינ'</th><th>ימים לא בבסיס</th></tr></thead>
                            <tbody>{result.stats.map((s) => <tr key={s.name}><th>{s.name}</th><td>{s.hours}</td><td>{s.target}</td><td>{s.nights}</td><td>{s.weekendHours}</td><td>{s.minGap ?? '-'}</td><td>{s.leaveDays}</td></tr>)}</tbody></table></div>
                        <p className="rp-sm">היעד מתחשב בימים שהאדם לא בבסיס. "לילה" = שעות בין 22:00 ל-06:00.</p>
                    </Group>}
                </>;
            })()}
            <Closing>לא נשמר ולא נשלח כלום מהדף הזה. עדיין לא מוגדר: מגבלות ימים רצופים, כשירויות לפי משימה, ותאריכים מדויקים (כרגע מספרי ימים בלוח).</Closing>
        </div>
    </FileCard>;
}
