"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useExamVideoRoom } from "@/lib/use-exam-video-room";

function TeacherAudio({ stream, enabled }: { stream: MediaStream; enabled: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    element.srcObject = stream;
    element.muted = !enabled;
    if (enabled) void element.play().catch(() => undefined);
    else element.pause();
  }, [stream, enabled]);

  return <audio ref={audio} autoPlay={enabled} muted={!enabled} aria-label="Teacher voice" style={{ display: "none" }} />;
}

export function CandidateExamRoom({ attemptId, stream }: { attemptId: string; stream: MediaStream }) {
  const preview = useRef<HTMLVideoElement>(null);
  const [microphoneTrack, setMicrophoneTrack] = useState<MediaStreamTrack | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(false);
  const [teacherAudioEnabled, setTeacherAudioEnabled] = useState(false);
  const [audioError, setAudioError] = useState("");
  const { isLive, remoteAudioStreams, setOutgoingAudioTrack } = useExamVideoRoom(attemptId, stream, "candidate");

  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
  }, [stream]);

  useEffect(() => () => microphoneTrack?.stop(), [microphoneTrack]);

  const toggleMicrophone = async () => {
    setAudioError("");
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
    <section aria-label="Live exam room" style={{ margin: "10px 0", padding: 10, borderRadius: 10, background: "#f0fdf4", color: "#166534" }}>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 9, fontSize: 13 }}>
        <video ref={preview} autoPlay muted playsInline aria-label="Your camera preview" style={{ width: 54, height: 40, objectFit: "cover", borderRadius: 5, background: "#111" }} />
        {isLive && <b>Live video shared with teacher</b>}
        <button type="button" className="button button-secondary" onClick={() => void toggleMicrophone()} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {microphoneEnabled ? <MicOff size={15}/> : <Mic size={15}/>}{microphoneEnabled ? "Mute microphone" : "Unmute microphone"}
        </button>
        <button type="button" className="button button-secondary" onClick={() => setTeacherAudioEnabled(enabled => !enabled)} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {teacherAudioEnabled ? <VolumeX size={15}/> : <Volume2 size={15}/>}{teacherAudioEnabled ? "Mute teacher audio" : "Hear teacher"}
        </button>
      </div>
      <small style={{ display: "block", marginTop: 6, color: "#64748b", fontSize: 12 }}>
        Unmute microphone to reply. Use Hear teacher separately to listen to the teacher.
      </small>
      {audioError && <small role="alert" style={{ display: "block", marginTop: 6, color: "#b91c1c", fontSize: 12 }}>{audioError}</small>}
      {remoteAudioStreams.map(({ participantId, stream: audioStream }) => (
        <TeacherAudio key={participantId} stream={audioStream} enabled={teacherAudioEnabled} />
      ))}
    </section>
  );
}
