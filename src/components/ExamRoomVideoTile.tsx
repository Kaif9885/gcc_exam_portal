"use client";

import { useEffect, useRef } from "react";

export function ExamRoomVideoTile({ stream, label, muted = false }: { stream: MediaStream; label: string; muted?: boolean }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!video.current) return;
    video.current.srcObject = stream;
    void video.current.play().catch(() => undefined);
  }, [stream]);

  return (
    <article style={{ minWidth: 0, overflow: "hidden", border: "1px solid #dbe3ef", borderRadius: 10, background: "#fff" }}>
      <video
        ref={video}
        autoPlay
        playsInline
        muted={muted}
        aria-label={label}
        style={{ display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover", background: "#111" }}
      />
      <div style={{ padding: "7px 10px", color: "#334155", fontSize: 13, fontWeight: 700 }}>{label}</div>
    </article>
  );
}
