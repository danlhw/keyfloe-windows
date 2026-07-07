// Pre-interview setup panel — mount this in the dashboard (e.g. a "Me" /
// "Interview" tab; see INTEGRATION.md). Mirrors the Mac "About me" + Profiles +
// résumé-docs surfaces. The material entered here tailors every interview answer.

import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useInterviewContext } from "./interviewContextStore";
import { CMD, type InterviewProfile } from "./types";
import "./InterviewContextPanel.css";

export default function InterviewContextPanel() {
  const {
    ctx,
    loaded,
    load,
    setAboutMe,
    addProfile,
    updateProfile,
    deleteProfile,
    setActiveProfile,
    addDoc,
    removeDoc,
    toggleDoc,
  } = useInterviewContext();
  const [editing, setEditing] = useState<string | null>(null);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const activeProfile = ctx.profiles.find((p) => p.id === editing);

  return (
    <div className="kf-ivc">
      <div className="kf-ivc-head">
        <h2>Interview mode</h2>
        <button
          className="kf-ivc-start"
          onClick={() => invoke(CMD.toggle).catch(console.error)}
        >
          Start interview
        </button>
      </div>
      <p className="kf-ivc-sub">
        A private, screen-share-invisible overlay listens to you and the
        interviewer and feeds you tailored answers. Add your background below so
        answers sound like you.
      </p>

      {/* About me -------------------------------------------------- */}
      <section className="kf-ivc-card">
        <h3>About me</h3>
        <p className="kf-ivc-hint">
          Always included in every answer. Paste your résumé, experience, and
          anything you want the answers to draw on.
        </p>
        <textarea
          className="kf-ivc-textarea"
          value={ctx.aboutMe}
          rows={7}
          placeholder="I'm a senior backend engineer with 6 years at…"
          onChange={(e) => setAboutMe(e.target.value)}
        />
      </section>

      {/* Profiles -------------------------------------------------- */}
      <section className="kf-ivc-card">
        <div className="kf-ivc-card-head">
          <h3>Profiles</h3>
          <button
            className="kf-ivc-add"
            onClick={() => setEditing(addProfile())}
          >
            + New profile
          </button>
        </div>
        <p className="kf-ivc-hint">
          Optional per-interview cheat-sheets (résumé + job description + company
          + notes). The active one is loaded into answers.
        </p>
        {ctx.profiles.length === 0 && (
          <div className="kf-ivc-empty">No profiles yet.</div>
        )}
        <ul className="kf-ivc-list">
          {ctx.profiles.map((p) => (
            <li key={p.id} className="kf-ivc-row">
              <label className="kf-ivc-active">
                <input
                  type="radio"
                  checked={ctx.activeProfileId === p.id}
                  onChange={() => setActiveProfile(p.id)}
                />
                <span>{p.name || "Untitled profile"}</span>
              </label>
              <div className="kf-ivc-row-actions">
                <button onClick={() => setEditing(p.id)}>Edit</button>
                <button onClick={() => deleteProfile(p.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Résumé docs ---------------------------------------------- */}
      <section className="kf-ivc-card">
        <h3>Résumé documents</h3>
        <p className="kf-ivc-hint">
          Extra docs (a second résumé, prep notes). Enabled docs are added to the
          answer context.
        </p>
        <ul className="kf-ivc-list">
          {ctx.docs.map((d) => (
            <li key={d.id} className="kf-ivc-row">
              <label className="kf-ivc-active">
                <input
                  type="checkbox"
                  checked={d.enabled}
                  onChange={() => toggleDoc(d.id)}
                />
                <span>{d.label}</span>
              </label>
              <div className="kf-ivc-row-actions">
                <button onClick={() => removeDoc(d.id)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
        <AddDoc onAdd={addDoc} />
      </section>

      {activeProfile && (
        <ProfileEditor
          profile={activeProfile}
          onSave={updateProfile}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function AddDoc({ onAdd }: { onAdd: (label: string, body: string) => void }) {
  const [label, setLabel] = useState("");
  const [body, setBody] = useState("");
  return (
    <div className="kf-ivc-adddoc">
      <input
        placeholder="Label (e.g. Résumé)"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <textarea
        placeholder="Paste document text…"
        value={body}
        rows={3}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        disabled={!body.trim()}
        onClick={() => {
          onAdd(label.trim(), body.trim());
          setLabel("");
          setBody("");
        }}
      >
        Add document
      </button>
    </div>
  );
}

function ProfileEditor({
  profile,
  onSave,
  onClose,
}: {
  profile: InterviewProfile;
  onSave: (p: InterviewProfile) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(profile);
  useEffect(() => setDraft(profile), [profile.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const field = (k: keyof InterviewProfile, v: string) =>
    setDraft((d) => ({ ...d, [k]: v }));

  return (
    <div className="kf-ivc-modal" onClick={onClose}>
      <div className="kf-ivc-modal-body" onClick={(e) => e.stopPropagation()}>
        <input
          className="kf-ivc-name"
          value={draft.name}
          placeholder="Profile name"
          onChange={(e) => field("name", e.target.value)}
        />
        <Labeled label="Résumé">
          <textarea
            rows={5}
            value={draft.resumeText}
            onChange={(e) => field("resumeText", e.target.value)}
          />
        </Labeled>
        <Labeled label="Job description">
          <textarea
            rows={4}
            value={draft.jobDescription}
            onChange={(e) => field("jobDescription", e.target.value)}
          />
        </Labeled>
        <Labeled label="Company info">
          <textarea
            rows={3}
            value={draft.companyInfo}
            onChange={(e) => field("companyInfo", e.target.value)}
          />
        </Labeled>
        <Labeled label="Prep notes">
          <textarea
            rows={3}
            value={draft.notes}
            onChange={(e) => field("notes", e.target.value)}
          />
        </Labeled>
        <div className="kf-ivc-modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="kf-ivc-primary"
            onClick={() => {
              onSave(draft);
              onClose();
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function Labeled({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="kf-ivc-labeled">
      <span>{label}</span>
      {children}
    </label>
  );
}
