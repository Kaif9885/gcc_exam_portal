"use client";

import { useEffect, useState } from "react";
import { Mic, MicOff, Users } from "lucide-react";
import { ExamRoomVideoTile } from "@/components/ExamRoomVideoTile";
import { useExamVideoRoom } from "@/lib/use-exam-video-room";

export function TeacherExamRoom({ attemptId, studentName, className, rollNumber }: { attemptId: string; studentName: string; className: string; rollNumber: string }) {
  const [audioTrack, setAudioTrack] = useState<MediaStreamTrack | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [error, setError] = useState("");
  const { remoteVideos, error: roomError, setOutgoingAudioTrack } = useExamVideoRoom(attemptId, null, "teacher");
  const studentVideo = remoteVideos.find(participant => participant.role === "candidate");

  useEffect(() => () => audioTrack?.stop(), [audioTrack]);

  const toggleMicrophone = async () => {
    setError("");
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      setMicrophoneEnabled(audioTrack.enabled);
      return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Microphone access requires a secure HTTPS connection.");
      return;
    }

    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      const track = audioStream.getAudioTracks()[0];
      if (!track) throw new Error("No microphone was found.");
      track.enabled = true;
      setAudioTrack(track);
      await setOutgoingAudioTrack(track);
      setMicrophoneEnabled(true);
    } catch (cause) {
      const errorName = cause instanceof DOMException ? cause.name : "";
      if (errorName === "NotAllowedError" || errorName === "SecurityError") {
        setError("Microphone permission denied. Allow microphone access in browser site settings, then try again.");
      } else if (errorName === "NotFoundError") {
        setError("No microphone was found. Connect a microphone and try again.");
      } else {
        setError(cause instanceof Error ? cause.message : "Could not enable the microphone.");
      }
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
        <button type="button" className="button button-secondary" onClick={() => void toggleMicrophone()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {microphoneEnabled ? <MicOff size={15}/> : <Mic size={15}/>}{microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
        </button>
      </div>
      {(error || roomError) && <small role="status" style={{ display: "block", padding: "0 10px 10px", color: "#b91c1c" }}>{error || roomError}</small>}
    </article>
  );
}
