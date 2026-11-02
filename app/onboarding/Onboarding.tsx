"use client";

import { useState, useTransition } from "react";
import { saveNameAndGoals, setOnboardingStep, type GoalInput } from "../actions/onboarding";

const TOTAL_SCREENS = 5;
const MIN_FIELDS = 5;

// Each suggestion has a third-person ending and a full phrase for when the toggle is off.
const SUGGESTIONS = [
  { third: "runs and completes a marathon", plain: "Run and complete a marathon" },
  { third: "eats healthy 80 percent of the time", plain: "Eat healthy 80 percent of the time" },
  { third: "builds muscle and goes to the gym", plain: "Build muscle and go to the gym" },
  { third: "makes 40k a year", plain: "Make 40k a year" },
  { third: "drinks 3 liters of water a day", plain: "Drink 3 liters of water a day" },
  { third: "builds a business", plain: "Build a business" },
];

type Row = GoalInput & { key: string };
let keySeq = 0;
const newRow = (g?: Partial<GoalInput>): Row => ({ key: `r${keySeq++}`, id: g?.id, text: g?.text ?? "", why: g?.why ?? "" });

type Props = {
  initialStep: number;
  initialName: string;
  initialThirdPerson: boolean;
  initialGoals: GoalInput[];
};

export default function Onboarding({ initialStep, initialName, initialThirdPerson, initialGoals }: Props) {
  const [step, setStep] = useState(Math.min(Math.max(initialStep, 1), TOTAL_SCREENS));
  const [name, setName] = useState(initialName);
  const [thirdPerson, setThirdPerson] = useState(initialThirdPerson);
  const [rows, setRows] = useState<Row[]>(() => {
    const r = initialGoals.map(newRow);
    while (r.length < MIN_FIELDS) r.push(newRow());
    return r;
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const go = (next: number) => {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
    startTransition(() => setOnboardingStep(next));
  };

  const filled = rows.filter((r) => r.text.trim()).length;
  const canContinue = name.trim().length > 0 && filled > 0;

  const updateRow = (key: string, patch: Partial<GoalInput>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const applySuggestion = (text: string) => {
    setRows((rs) => {
      const i = rs.findIndex((r) => !r.text.trim());
      if (i === -1) return [...rs, newRow({ text })];
      return rs.map((r, j) => (j === i ? { ...r, text } : r));
    });
  };

  const removeRow = (key: string) =>
    setRows((rs) => {
      const next = rs.filter((r) => r.key !== key);
      while (next.length < MIN_FIELDS) next.push(newRow());
      return next;
    });

  const continueFromGoals = () => {
    if (!name.trim()) return setError("Please enter your name.");
    if (filled === 0) return setError("Please write at least one goal.");
    setError(null);
    startTransition(async () => {
      const res = await saveNameAndGoals({
        name,
        thirdPerson,
        goals: rows.filter((r) => r.text.trim()).map(({ id, text, why }) => ({ id, text, why })),
      });
      if (!res.ok) return setError(res.error);
      // Keep the saved ids so later saves update the same goals.
      setRows((rs) => {
        const saved = rs.filter((r) => r.text.trim()).map((r, i) => ({ ...r, id: res.ids[i] }));
        const empty = rs.filter((r) => !r.text.trim());
        const all = [...saved, ...empty];
        while (all.length < MIN_FIELDS) all.push(newRow());
        return all;
      });
      go(3);
    });
  };

  const usedSuggestions = new Set(rows.map((r) => r.text.trim().toLowerCase()));
  const prefix = `${name.trim() || "[Name]"} is a person who…`;

  return (
    <main className="onboarding">
      <div className="ob-progress" aria-label={`Step ${step} of ${TOTAL_SCREENS}`}>
        {Array.from({ length: TOTAL_SCREENS }, (_, i) => (
          <span key={i} className={i < step ? "on" : ""} />
        ))}
      </div>

      {step === 1 && (
        <section className="ob-screen">
          <div className="ob-body">
            <h1>You already know what you want.</h1>
            <p>Most people have goals. They know the kind of life they want to live.</p>
            <p>
              But the goals stay vague, and there is no plan for the day in front of them. So the things they do every
              day slowly drift away from the things they want most.
            </p>
            <p className="lead">Progress builds that daily plan for you.</p>
          </div>
          <button className="btn primary" onClick={() => go(2)}>
            Get started
          </button>
        </section>
      )}

      {step === 2 && (
        <section className="ob-screen">
          <div className="ob-body stack">
            <label className="field">
              <span className="field-title">What&apos;s your name?</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="given-name"
                placeholder="Your name"
                maxLength={60}
              />
            </label>

            <div>
              <h1>What do you want to achieve this year?</h1>
              <p className="muted">
                We recommend writing your goals in third person, as if you are already that person. You can also write
                them any way you like.
              </p>
            </div>

            <label className="toggle">
              <input type="checkbox" role="switch" checked={thirdPerson} onChange={(e) => setThirdPerson(e.target.checked)} />
              <span className="toggle-track" aria-hidden />
              <span>Write in third person (recommended)</span>
            </label>

            <div className="chips" aria-label="Suggestions">
              {SUGGESTIONS.map((s) => {
                const text = thirdPerson ? s.third : s.plain;
                return (
                  <button
                    key={s.third}
                    type="button"
                    className={`chip${usedSuggestions.has(text.toLowerCase()) ? " used" : ""}`}
                    onClick={() => applySuggestion(text)}
                  >
                    + {text}
                  </button>
                );
              })}
            </div>

            <ol className="goal-list">
              {rows.map((r, i) => (
                <li key={r.key} className="goal-item">
                  <div className="goal-input">
                    {thirdPerson && <span className="goal-prefix">{prefix}</span>}
                    <div className="goal-input-row">
                      <input
                        type="text"
                        value={r.text}
                        onChange={(e) => updateRow(r.key, { text: e.target.value })}
                        placeholder={thirdPerson ? "finishes what they start" : `Goal ${i + 1}`}
                        aria-label={`Goal ${i + 1}`}
                        maxLength={300}
                      />
                      {(r.text || r.why || rows.length > MIN_FIELDS) && (
                        <button type="button" className="icon-btn" aria-label={`Clear goal ${i + 1}`} onClick={() => removeRow(r.key)}>
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                  <label className="why">
                    <span>Why do you want this?</span>
                    <input
                      type="text"
                      value={r.why}
                      onChange={(e) => updateRow(r.key, { why: e.target.value })}
                      maxLength={500}
                    />
                  </label>
                </li>
              ))}
            </ol>
            <p className="muted small">5 goals is recommended. More than 5 makes it harder to stay focused.</p>
            <button type="button" className="btn ghost" onClick={() => setRows((rs) => [...rs, newRow()])}>
              + Add another goal
            </button>
          </div>

          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="ob-actions">
            <button className="btn" onClick={() => go(1)}>
              Back
            </button>
            <button className="btn primary" onClick={continueFromGoals} disabled={!canContinue || pending}>
              {pending ? "Saving…" : "Continue"}
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section className="ob-screen">
          <div className="ob-body">
            <h1>So what&apos;s in the way?</h1>
            <p>
              The only thing between you and these goals is not taking action every day.
            </p>
            <p>
              The steps don&apos;t have to be big. A small action toward each goal takes very little effort each day, and
              those small actions add up over the year.
            </p>
            <p className="lead">Let&apos;s turn each goal into one small step for today.</p>
          </div>
          <div className="ob-actions">
            <button className="btn" onClick={() => go(2)}>
              Back
            </button>
            <button className="btn primary" onClick={() => go(4)}>
              Break it down
            </button>
          </div>
        </section>
      )}

      {step >= 4 && (
        <section className="ob-screen">
          <div className="ob-body">
            <h1>Breaking it down…</h1>
            <p className="muted">
              Your name, goals and whys are saved. The AI breakdown into monthly goals and daily tasks is built in the
              next step.
            </p>
          </div>
          <div className="ob-actions">
            <button className="btn" onClick={() => go(3)}>
              Back
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
