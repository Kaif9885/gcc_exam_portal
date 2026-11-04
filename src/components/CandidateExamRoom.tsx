"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { useExamVideoRoom } from "@/lib/use-exam-video-room";

function TeacherAudio({ stream, enabled, onBlocked }: { stream: MediaStream; enabled: boolean; onBlocked: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.srcObject = stream;
    element.muted = !enabled;
    if (enabled) void element.play().catch(onBlocked);
    else element.pause();
  }, [stream, enabled, onBlocked]);

  return <audio ref={audio} autoPlay={enabled} muted={!enabled} aria-label="Teacher voice" style={{ display: "none" }} />;
}

export function CandidateExamRoom({ attemptId, stream }: { attemptId: string; stream: MediaStream }) {
  const preview = useRef<HTMLVideoElement>(null);
  const [teacherAudioEnabled, setTeacherAudioEnabled] = useState(false);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const handleAudioBlocked = useCallback(() => setAudioBlocked(true), []);
  const { isLive, remoteAudioStreams } = useExamVideoRoom(attemptId, stream, "candidate");

  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
  }, [stream]);

  return (
    <section aria-label="Live exam room" style={{ margin: "10px 0", padding: 10, borderRadius: 10, background: "#f0fdf4", color: "#166534" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
        <video ref={preview} autoPlay muted playsInline aria-label="Your camera preview" style={{ width: 54, height: 40, objectFit: "cover", borderRadius: 5, background: "#111" }} />
        {isLive && <b>Live video shared with teacher</b>}
        <button type="button" className="button button-secondary" onClick={() => { setAudioBlocked(false); setTeacherAudioEnabled(enabled => !enabled); }} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {teacherAudioEnabled ? <VolumeX size={15}/> : <Volume2 size={15}/>}{teacherAudioEnabled ? "Mute teacher audio" : "Enable teacher audio"}
        </button>
      </div>
      <small style={{ display: "block", marginTop: 6, color: audioBlocked ? "#b91c1c" : "#64748b", fontSize: 12 }}>
        {audioBlocked ? "Tap Enable teacher audio again to allow browser playback. No student microphone permission is needed." : "Enable teacher audio to hear them. Your microphone is not used."}
      </small>
      {remoteAudioStreams.map(({ participantId, stream: audioStream }) => (
        <TeacherAudio key={participantId} stream={audioStream} enabled={teacherAudioEnabled} onBlocked={handleAudioBlocked} />
      ))}
    </section>
  );
}
