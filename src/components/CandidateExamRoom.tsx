"use client";

import { useEffect, useRef } from "react";
import { ExamRoomVideoTile } from "@/components/ExamRoomVideoTile";
import { useExamVideoRoom } from "@/lib/use-exam-video-room";

export function CandidateExamRoom({ attemptId, stream }: { attemptId: string; stream: MediaStream }) {
  const preview = useRef<HTMLVideoElement>(null);
  const { remoteVideos, isLive } = useExamVideoRoom(attemptId, stream);
  const teachers = remoteVideos.filter(participant => participant.role === "teacher");

  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
  }, [stream]);

  return (
    <section aria-label="Live exam room" style={{ margin: "10px 0", padding: 10, borderRadius: 10, background: "#f0fdf4", color: "#166534" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, fontSize: 13 }}>
        <video ref={preview} autoPlay muted playsInline aria-label="Your camera preview" style={{ width: 54, height: 40, objectFit: "cover", borderRadius: 5, background: "#111" }} />
        {isLive && <b>Live video shared with teacher</b>}
      </div>
      {teachers.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 10, marginTop: 10 }}>
          {teachers.map(teacher => <ExamRoomVideoTile key={teacher.participantId} stream={teacher.stream} label={`Teacher · ${teacher.displayName}`} />)}
        </div>
      )}
    </section>
  );
}
