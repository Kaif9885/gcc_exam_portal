"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useExamVideoRoom } from "@/lib/use-exam-video-room";

function TeacherAudio({ stream, enabled, register }: { stream: MediaStream; enabled: boolean; register: (element: HTMLAudioElement | null) => void }) {
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    register(element);
    element.srcObject = stream;
    element.muted = !enabled;
    if (enabled) void element.play().catch(() => undefined);
    else element.pause();
    return () => register(null);
  }, [stream, enabled, register]);

  return <audio ref={audio} autoPlay={enabled} muted={!enabled} aria-label="Teacher voice" style={{ display: "none" }} />;
}

export function CandidateExamRoom({ attemptId, stream }: { attemptId: string; stream: MediaStream }) {
  const preview = useRef<HTMLVideoElement>(null);
  const teacherAudioElements = useRef(new Set<HTMLAudioElement>());
  const [microphoneTrack, setMicrophoneTrack] = useState<MediaStreamTrack | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [teacherAudioEnabled, setTeacherAudioEnabled] = useState(false);
  const [audioError, setAudioError] = useState("");
  const { isLive, cameraPublished, error: roomError, remoteAudioStreams, setOutgoingAudioTrack } = useExamVideoRoom(attemptId, stream, "candidate");

  const registerTeacherAudio = useCallback((element: HTMLAudioElement | null) => {
    if (element) teacherAudioElements.current.add(element);
    else teacherAudioElements.current.forEach(audio => {
      if (!audio.isConnected) teacherAudioElements.current.delete(audio);
    });
  }, []);

  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
  }, [stream]);

  useEffect(() => () => microphoneTrack?.stop(), [microphoneTrack]);

  const toggleMicrophone = async () => {
    setAudioError("");
    if (!teacherAudioEnabled) {
      // The microphone button is the student's user gesture that permits speaker playback.
      setTeacherAudioEnabled(true);
      teacherAudioElements.current.forEach(audio => {
        audio.muted = false;
        void audio.play().catch(() => undefined);
      });
    }
    if (microphoneTrack) {
      microphoneTrack.enabled = !microphoneTrack.enabled;
      setMicrophoneEnabled(microphoneTrack.enabled);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setAudioError("Microphone requires HTTPS or localhost.");
      return;
    }
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      const track = audioStream.getAudioTracks()[0];
      if (!track) throw new Error("No microphone was found.");
      track.enabled = true;
      setMicrophoneTrack(track);
      await setOutgoingAudioTrack(track);
      setMicrophoneEnabled(true);
    } catch (cause) {
      const name = cause instanceof DOMException ? cause.name : "";
      setAudioError(name === "NotAllowedError" || name === "SecurityError"
        ? "Microphone permission denied. Allow it in browser site settings, then try again."
        : cause instanceof Error ? cause.message : "Could not enable the microphone.");
    }
  };

  return (
    <section aria-label="Live exam room" style={{ margin: "12px 0", padding: 12, border: "1px solid #cfe7d7", borderRadius: 14, background: "linear-gradient(135deg, #f0fdf4 0%, #f8fbff 100%)", color: "#166534", boxShadow: "0 4px 14px rgba(22, 101, 52, .06)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0 }}>
        <video ref={preview} autoPlay muted playsInline aria-label="Your camera preview" style={{ width: 64, height: 48, flex: "0 0 auto", objectFit: "cover", borderRadius: 9, background: "#111", border: "1px solid #d6e5db" }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <b style={{ display: "block", fontSize: 14, lineHeight: 1.3 }}>{roomError ? "Camera connection needs attention" : cameraPublished ? "Camera streaming to exam room" : isLive ? "Connected · starting camera stream…" : "Connecting to live exam room…"}</b>
          <span style={{ display: "block", marginTop: 3, color: "#64748b", fontSize: 12 }}>Teacher voice {teacherAudioEnabled ? "is ready" : "will play when enabled"}</span>
        </div>
      </div>
      {roomError && <small role="alert" style={{ display: "block", marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "#fff1f2", color: "#b91c1c", fontSize: 12, lineHeight: 1.4 }}>{roomError}</small>}
      <button
        type="button"
        className="button"
        aria-pressed={microphoneEnabled}
        onClick={() => void toggleMicrophone()}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 9, width: "100%", minHeight: 46, marginTop: 11, padding: "10px 14px", border: `1px solid ${microphoneEnabled ? "#b91c1c" : "#166534"}`, borderRadius: 10, background: microphoneEnabled ? "#fff1f2" : "#166534", color: microphoneEnabled ? "#b91c1c" : "#fff", fontSize: 15, fontWeight: 700, boxShadow: "0 2px 6px rgba(15, 23, 42, .08)" }}
      >
        {microphoneEnabled ? <MicOff size={18}/> : <Mic size={18}/>}<span>{microphoneEnabled ? "Mute" : "Unmute"}</span>
      </button>
      {audioError && <small role="alert" style={{ display: "block", marginTop: 8, padding: "8px 10px", borderRadius: 8, background: "#fff1f2", color: "#b91c1c", fontSize: 12, lineHeight: 1.4 }}>{audioError}</small>}
      {remoteAudioStreams.map(({ participantId, stream: audioStream }) => (
        <TeacherAudio key={participantId} stream={audioStream} enabled={teacherAudioEnabled} register={registerTeacherAudio} />
      ))}
    </section>
  );
}
