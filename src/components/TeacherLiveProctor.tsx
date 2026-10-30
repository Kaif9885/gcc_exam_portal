"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Users } from "lucide-react";

type Session = {
  id: string; studentName: string; rollNumber: string; className: string;
  examTitle: string; subject: string; status: string; startedAt: string;
};
const classOptions = ["Class 8", "Class 9", "Class 10 Boys", "Class 10 Girls", "Class 11", "Class 12"];

export function TeacherLiveProctor({ backendConfigured = true }: { backendConfigured?: boolean }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState("all");

  const load = useCallback(async () => {
    if (!backendConfigured) { setError("Active exam sessions need the school database configured."); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/teacher/sessions", { cache: "no-store" });
      const json = await res.json() as { sessions?: Session[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load active exams.");
      setSessions(Array.isArray(json.sessions) ? json.sessions.filter(s => s.status === "in_progress") : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load active exams.");
    } finally { setLoading(false); }
  }, [backendConfigured]);

  useEffect(() => {
    void load();
    if (!backendConfigured) return;
    const timer = window.setInterval(() => void load(), 15000);
    return () => window.clearInterval(timer);
  }, [load, backendConfigured]);

  const visible = selectedClass === "all"
    ? sessions
    : sessions.filter(item => item.className === selectedClass);

  return (
    <section className="proctor-panel">
      <div className="results-toolbar">
        <div>
          <h3>Active exam sessions</h3>
          <p>View which students are currently taking exams across Classes 8–12. Camera is not used or streamed.</p>
        </div>
        <button className="button button-secondary" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={13} />
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>
      <div className="proctor-filter">
        <label htmlFor="live-class-filter">Class</label>
        <select id="live-class-filter" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
          <option value="all">All classes (8–12)</option>
          {classOptions.map(name => <option key={name}>{name}</option>)}
        </select>
        <span>{visible.length} active</span>
      </div>
      {error && <div className="notice warning admission-notice">{error}</div>}
      {!visible.length && !error ? (
        <div className="empty-exams">
          <Users size={17} />
          <span>{sessions.length ? "No active exams in this class." : "No active exam sessions across Classes 8–12."}</span>
        </div>
      ) : (
        <div className="results-table-wrap">
          <table className="results-table">
            <thead><tr><th>STUDENT</th><th>CLASS</th><th>EXAM</th><th>STARTED</th></tr></thead>
            <tbody>
              {visible.map(item => (
                <tr key={item.id}>
                  <td><b>{item.studentName}</b><small>Roll {item.rollNumber}</small></td>
                  <td>{item.className}</td>
                  <td><b>{item.examTitle}</b><small>{item.subject}</small></td>
                  <td>{new Date(item.startedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
