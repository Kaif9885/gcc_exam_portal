"use client";

import { useEffect, useRef } from "react";
import { useExamVideoRoom } from "@/lib/use-exam-video-room";

export function CandidateExamRoom({ attemptId, stream }: { attemptId: string; stream: MediaStream }) {
  const preview = useRef<HTMLVideoElement>(null);
  const { isLive, remoteAudioStreams } = useExamVideoRoom(attemptId, stream, "candidate");

  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
  }, [stream]);

  return (
    <section aria-label="Live exam room" style={{ margin: "10px 0", padding: 10, borderRadius: 10, background: "#f0fdf4", color: "#166534" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
        <video ref={preview} autoPlay muted playsInline aria-label="Your camera preview" style={{ width: 54, height: 40, objectFit: "cover", borderRadius: 5, background: "#111" }} />
        {isLive && <b>Live video shared with teacher</b>}
      </div>
      {remoteAudioStreams.map(({ participantId, stream: audioStream }) => <audio key={participantId} autoPlay aria-label="Teacher voice" style={{ display: "none" }} ref={element => { if (element && element.srcObject !== audioStream) { element.srcObject = audioStream; void element.play().catch(() => undefined); } }} />)}
    </section>
  );
}
