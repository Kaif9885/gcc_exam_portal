"use client";

import { useEffect, useRef, useState } from "react";
import { Users, Volume2, VolumeX } from "lucide-react";
import { ExamRoomVideoTile } from "@/components/ExamRoomVideoTile";
import { useExamVideoRoom } from "@/lib/use-exam-video-room";

export function TeacherExamRoom({ attemptId, studentName, className, rollNumber, audioTrack, microphoneEnabled }: { attemptId: string; studentName: string; className: string; rollNumber: string; audioTrack: MediaStreamTrack | null; microphoneEnabled: boolean }) {
  const [studentAudioMuted, setStudentAudioMuted] = useState(true);
  const [studentAudioError, setStudentAudioError] = useState("");
  const studentAudioElement = useRef<HTMLAudioElement>(null);
  const { remoteVideos, remoteAudioStreams, error: roomError, setOutgoingAudioTrack } = useExamVideoRoom(attemptId, null, "teacher");
  const studentVideo = remoteVideos.find(participant => participant.role === "candidate");
  const studentAudio = remoteAudioStreams.find(participant => participant.participantId === studentVideo?.participantId);

  useEffect(() => { void setOutgoingAudioTrack(audioTrack); }, [audioTrack, setOutgoingAudioTrack]);
  useEffect(() => {
    const element = studentAudioElement.current;
    if (!element || !studentAudio) return;
    element.srcObject = studentAudio.stream;
    element.muted = studentAudioMuted;
    if (!studentAudioMuted) void element.play().catch(() => setStudentAudioError("Browser blocked audio playback. Press Hear student reply again."));
  }, [studentAudio, studentAudioMuted]);

  const toggleStudentAudio = () => {
    const element = studentAudioElement.current;
    if (!element) return;
    setStudentAudioError("");
    if (studentAudioMuted) {
      // Start playback synchronously in the teacher's click handler for mobile autoplay policies.
      element.srcObject = studentAudio?.stream ?? element.srcObject;
      element.muted = false;
      void element.play().then(() => setStudentAudioMuted(false)).catch(() => {
        element.muted = true;
        setStudentAudioError("Browser blocked audio playback. Check the device volume and press Hear student reply again.");
      });
    } else {
      element.muted = true;
      setStudentAudioMuted(true);
    }
  };

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
        {studentVideo && <button type="button" className="button button-secondary" disabled={!studentAudio} onClick={toggleStudentAudio} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {studentAudioMuted ? <Volume2 size={15}/> : <VolumeX size={15}/>}{studentAudioMuted ? "Hear student reply" : "Mute student playback"}
        </button>}
      </div>
      {studentAudio && <audio ref={studentAudioElement} autoPlay={!studentAudioMuted} muted={studentAudioMuted} aria-label="Student reply audio" style={{ display: "none" }} />}
      {studentAudioError && <small role="status" style={{ display: "block", padding: "0 10px 10px", color: "#b91c1c" }}>{studentAudioError}</small>}
      {roomError && <small role="status" style={{ display: "block", padding: "0 10px 10px", color: "#b91c1c" }}>{roomError}</small>}
    </article>
  );
}
