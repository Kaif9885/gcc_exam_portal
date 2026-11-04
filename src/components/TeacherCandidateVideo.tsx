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

export function TeacherCandidateVideo({ attemptId, studentName, className, rollNumber }: { attemptId: string; studentName: string; className: string; rollNumber: string }) {
  const [status, setStatus] = useState("Connecting to camera…");
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    let stopped = false;
    let cursor = "";
    const callId = crypto.randomUUID();
    const pendingIce: RTCIceCandidateInit[] = [];
    const peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    peer.addTransceiver("video", { direction: "recvonly" });
    peer.ontrack = event => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      if (video.current) {
        video.current.srcObject = stream;
        setStatus(event.track.muted ? "Camera connected · starting video…" : "Video received · starting playback…");
        void video.current.play().catch(() => setStatus("Video received · tap video to play"));
      }
      event.track.onunmute = () => {
        if (!video.current) return;
        void video.current.play().catch(() => setStatus("Video received · tap video to play"));
      };
      event.track.onmute = () => setStatus("Camera connected · video paused");
    };
    peer.onicecandidate = event => { if (event.candidate) void sendSignal(attemptId, callId, "ice", event.candidate.toJSON()).catch(() => undefined); };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "failed") setStatus("Video connection failed. Check network access or try again.");
      else if (peer.connectionState === "disconnected") setStatus("Video connection interrupted…");
      else if (peer.connectionState === "connected") setStatus("Connected · waiting for video frames…");
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

  return <article style={{ minWidth: 0, overflow: "hidden", border: "1px solid #dbe3ef", borderRadius: 10, background: "#fff" }}>
    <div style={{ position: "relative", background: "#111" }}>
      <video ref={video} autoPlay playsInline muted aria-label={`Live exam video for ${studentName}`} onPlaying={() => setStatus("Live video")} onLoadedData={() => { if (video.current && video.current.videoWidth > 0) setStatus("Live video"); }} onClick={() => { void video.current?.play().catch(() => undefined); }} style={{ display: "block", width: "100%", aspectRatio: "16 / 9", objectFit: "cover", background: "#111" }} />
      {status !== "Live video" && <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 12, color: "#fff", background: "linear-gradient(transparent, rgba(0,0,0,.35))", textAlign: "center", pointerEvents: "none" }}><span>{status}<br/><small>Click to retry playback</small></span></div>}
    </div>
    <div style={{ padding: "10px 12px" }}>
      <b style={{ display: "flex", alignItems: "center", gap: 7 }}>{status === "Live video" ? <Camera size={16}/> : <CameraOff size={16}/>} {studentName}</b>
      <small style={{ display: "block", marginTop: 4, color: "#64748b" }}>{className} · Roll {rollNumber}</small>
      <small style={{ display: "block", marginTop: 3, color: status === "Live video" ? "#15803d" : "#64748b" }}>{status}</small>
    </div>
  </article>;
}
