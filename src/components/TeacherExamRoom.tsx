"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Mic, MicOff, Users } from "lucide-react";
import { ExamRoomVideoTile } from "@/components/ExamRoomVideoTile";
import { useExamVideoRoom } from "@/lib/use-exam-video-room";

export function TeacherExamRoom({ attemptId, studentName, className, rollNumber }: { attemptId: string; studentName: string; className: string; rollNumber: string }) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [joining, setJoining] = useState(false);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [error, setError] = useState("");
  const preview = useRef<HTMLVideoElement>(null);
  const { remoteVideos, error: roomError } = useExamVideoRoom(attemptId, localStream);

  useEffect(() => {
    if (preview.current && localStream) preview.current.srcObject = localStream;
  }, [localStream]);

  useEffect(() => () => localStream?.getTracks().forEach(track => track.stop()), [localStream]);

  const joinRoom = async () => {
    setError("");
    setJoining(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access requires a secure HTTPS connection.");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.getAudioTracks().forEach(track => { track.enabled = false; });
      setMicrophoneEnabled(false);
      setLocalStream(stream);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not join the live room.");
    } finally {
      setJoining(false);
    }
  };

  const toggleMicrophone = () => {
    const track = localStream?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicrophoneEnabled(track.enabled);
  };

  const leaveRoom = () => {
    localStream?.getTracks().forEach(track => track.stop());
    setLocalStream(null);
    setMicrophoneEnabled(false);
  };

  return (
    <article style={{ minWidth: 0, overflow: "hidden", border: "1px solid #dbe3ef", borderRadius: 10, background: "#fff" }}>
      <header style={{ padding: "10px 12px", borderBottom: "1px solid #e2e8f0" }}>
        <b>{studentName}</b>
        <small style={{ display: "block", marginTop: 4, color: "#64748b" }}>{className} · Roll {rollNumber}</small>
        <small style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 6, color: "#64748b" }}><Users size={14}/>{remoteVideos.length} other participant{remoteVideos.length === 1 ? "" : "s"} joined</small>
        {!localStream && <small style={{ display: "block", marginTop: 6, color: "#64748b" }}>Joining shares your camera with the student and joined teachers. Your microphone starts muted.</small>}
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10, padding: 10 }}>
        {localStream && <div style={{ minWidth: 0, overflow: "hidden", border: "1px solid #dbe3ef", borderRadius: 10, background: "#fff" }}>
          <video ref={preview} autoPlay muted playsInline aria-label="Your live camera" style={{ display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover", background: "#111" }} />
          <div style={{ padding: "7px 10px", color: "#334155", fontSize: 13, fontWeight: 700 }}>You · Teacher</div>
        </div>}
        {remoteVideos.map(participant => (
          <ExamRoomVideoTile
            key={participant.participantId}
            stream={participant.stream}
            label={participant.role === "candidate" ? `Student · ${participant.displayName}` : `Teacher · ${participant.displayName}`}
            muted={participant.role === "candidate"}
          />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "0 10px 10px" }}>
        {!localStream ? (
          <button type="button" className="button button-primary" disabled={joining} onClick={() => void joinRoom()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Camera size={15}/>{joining ? "Joining live room…" : "Join live room"}
          </button>
        ) : <>
          <button type="button" className="button button-secondary" onClick={toggleMicrophone} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {microphoneEnabled ? <MicOff size={15}/> : <Mic size={15}/>}{microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
          </button>
          <button type="button" className="button button-secondary" onClick={leaveRoom} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <CameraOff size={15}/>Leave live room
          </button>
        </>}
      </div>
      {(error || roomError) && <small role="status" style={{ display: "block", padding: "0 10px 10px", color: "#b91c1c" }}>{error || roomError}</small>}
    </article>
  );
}
