"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";

type Signal = { id: string; callId: string; type: "offer" | "answer" | "ice" | "close"; payload: RTCSessionDescriptionInit | RTCIceCandidateInit | null };

async function sendSignal(attemptId: string, callId: string, type: Signal["type"], payload?: Signal["payload"]) {
  const response = await fetch(`/api/exam-video/${encodeURIComponent(attemptId)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId, type, ...(payload === undefined ? {} : { payload }) }),
  });
  if (!response.ok) throw new Error("Could not connect to the candidate camera.");
}

export function TeacherCandidateVideo({ attemptId, studentName }: { attemptId: string; studentName: string }) {
  const [status, setStatus] = useState("Requesting candidate video…");
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stopped = false;
    let cursor = "";
    const callId = crypto.randomUUID();
    const pendingIce: RTCIceCandidateInit[] = [];
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peer.addTransceiver("video", { direction: "recvonly" });
    peer.ontrack = event => {
      if (video.current) video.current.srcObject = event.streams[0] ?? new MediaStream([event.track]);
      setStatus("Live video");
    };
    peer.onicecandidate = event => { if (event.candidate) void sendSignal(attemptId, callId, "ice", event.candidate.toJSON()).catch(() => undefined); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") setStatus("Video connection failed. Check network access or try again.");
      else if (peer.connectionState === "disconnected") setStatus("Video connection interrupted…");
      else if (peer.connectionState === "connected") setStatus("Live video");
    };

    const connect = async () => {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        await sendSignal(attemptId, callId, "offer", peer.localDescription?.toJSON() ?? offer);
        setStatus("Waiting for candidate camera…");
      } catch (error) {
        setStatus(error instanceof Error ? error.message : "Could not start video connection.");
      }
    };
    const poll = async () => {
      try {
        const response = await fetch(`/api/exam-video/${encodeURIComponent(attemptId)}?callId=${encodeURIComponent(callId)}&after=${encodeURIComponent(cursor)}`, { cache: "no-store" });
        if (!response.ok) {
          setStatus(response.status === 403 ? "This exam attempt is no longer active." : "Waiting for video connection…");
          return;
        }
        const data = await response.json() as { messages?: Signal[] };
        for (const message of data.messages ?? []) {
          cursor = message.id;
          if (message.type === "answer" && message.payload && !peer.remoteDescription) {
            await peer.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
            for (const candidate of pendingIce) await peer.addIceCandidate(candidate);
            pendingIce.length = 0;
          } else if (message.type === "ice" && message.payload) {
            const candidate = message.payload as RTCIceCandidateInit;
            if (peer.remoteDescription) await peer.addIceCandidate(candidate);
            else pendingIce.push(candidate);
          }
        }
      } catch { setStatus("Reconnecting to candidate…"); }
    };
    void connect();
    void poll();
    const timer = window.setInterval(() => { if (!stopped) void poll(); }, 800);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      peer.close();
      void sendSignal(attemptId, callId, "close").catch(() => undefined);
    };
  }, [attemptId]);

  return <div style={{ display: "grid", gridTemplateColumns: "minmax(180px, 320px) 1fr", alignItems: "center", gap: 12, padding: 12, border: "1px solid #dbe3ef", borderRadius: 10, background: "#f8fafc" }}>
    <video ref={video} autoPlay playsInline controls muted aria-label={`Live exam video for ${studentName}`} style={{ width: "100%", aspectRatio: "16 / 9", objectFit: "cover", borderRadius: 7, background: "#111" }} />
    <div><b style={{ display: "flex", alignItems: "center", gap: 7 }}>{status === "Live video" ? <Camera size={16}/> : <CameraOff size={16}/>} {studentName}</b><small style={{ display: "block", marginTop: 5, color: "#64748b" }}>{status}</small></div>
  </div>;
}
