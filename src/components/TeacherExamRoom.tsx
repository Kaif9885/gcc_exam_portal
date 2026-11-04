"use client";

import { useEffect } from "react";
import { Users } from "lucide-react";
import { ExamRoomVideoTile } from "@/components/ExamRoomVideoTile";
import { useExamVideoRoom } from "@/lib/use-exam-video-room";

export function TeacherExamRoom({ attemptId, studentName, className, rollNumber, audioTrack, microphoneEnabled }: { attemptId: string; studentName: string; className: string; rollNumber: string; audioTrack: MediaStreamTrack | null; microphoneEnabled: boolean }) {
  const { remoteVideos, error: roomError, setOutgoingAudioTrack } = useExamVideoRoom(attemptId, null, "teacher");
  const studentVideo = remoteVideos.find(participant => participant.role === "candidate");

  useEffect(() => { void setOutgoingAudioTrack(audioTrack); }, [audioTrack, setOutgoingAudioTrack]);

  return (
    <article style={{ minWidth: 0, overflow: "hidden", border: "1px solid #dbe3ef", borderRadius: 10, background: "#fff" }}>
      <header style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
        <b>{studentName}</b>
        <small style={{ display: "block", marginTop: 4, color: "#64748b" }}>{className} · Roll {rollNumber}</small>
        <small style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, color: "#64748b" }}><Users size={14}/>{studentVideo ? "Student video connected" : "Waiting for student video…"}</small>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10, padding: 10 }}>
        {studentVideo && <ExamRoomVideoTile stream={studentVideo.stream} label={`Student · ${studentVideo.displayName}`} muted />}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 10px 10px" }}>
        <small style={{ color: microphoneEnabled ? "#15803d" : "#64748b" }}>{microphoneEnabled ? "Teacher audio is on for all active students" : "Teacher audio is muted"}</small>
      </div>
      {roomError && <small role="status" style={{ display: "block", padding: "0 10px 10px", color: "#b91c1c" }}>{roomError}</small>}
    </article>
  );
}
