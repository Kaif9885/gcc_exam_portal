"use client";

import { useEffect, useRef, useState } from "react";
import { getExamRtcConfiguration } from "@/lib/exam-rtc";

type Signal = { id: string; callId: string; type: "offer" | "answer" | "ice" | "close"; payload: RTCSessionDescriptionInit | RTCIceCandidateInit | null };

async function sendSignal(attemptId: string, callId: string, type: Signal["type"], payload?: Signal["payload"]) {
  await fetch(`/api/exam-video/${encodeURIComponent(attemptId)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ callId, type, ...(payload === undefined ? {} : { payload }) }),
  });
}

export function CandidateExamCamera({ attemptId, stream }: { attemptId: string; stream: MediaStream }) {
  const [status, setStatus] = useState("Camera on · waiting for teacher");
  const preview = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (preview.current) preview.current.srcObject = stream;
    let stopped = false;
    let cursor = "";
    let activeCallId = "";
    let peer: RTCPeerConnection | null = null;
    let iceServers: RTCIceServer[] | undefined;
    let needsIceServers = true;
    let pendingIce: RTCIceCandidateInit[] = [];
    const createPeer = (servers?: RTCIceServer[]) => {
      peer?.close();
      const connection = new RTCPeerConnection(getExamRtcConfiguration(servers));
      peer = connection;
      stream.getTracks().forEach(track => connection.addTrack(track, stream));
      connection.onicecandidate = event => { if (event.candidate && activeCallId) void sendSignal(attemptId, activeCallId, "ice", event.candidate.toJSON()); };
      connection.onconnectionstatechange = () => {
        if (peer === connection) setStatus(connection.connectionState === "connected" ? "Live video shared with teacher" : connection.connectionState === "failed" ? "Teacher video connection failed · TURN relay may be needed" : "Connecting to teacher…");
      };
      connection.oniceconnectionstatechange = () => {
        if (peer !== connection) return;
        if (connection.iceConnectionState === "failed") setStatus("Network path failed · ask the school to configure a TURN relay");
        else if (connection.iceConnectionState === "connected" || connection.iceConnectionState === "completed") setStatus("Network connected · sharing camera with teacher");
      };
      return connection;
    };
    const poll = async () => {
      try {
        const query = new URLSearchParams({ callId: activeCallId, after: cursor });
        if (needsIceServers) query.set("includeIceServers", "1");
        const response = await fetch(`/api/exam-video/${encodeURIComponent(attemptId)}?${query}`, { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json() as { callId?: string; messages?: Signal[]; iceServers?: RTCIceServer[] };
        if (data.iceServers) {
          iceServers = data.iceServers;
          needsIceServers = false;
        }
        if (data.callId && activeCallId && data.callId !== activeCallId) {
          peer?.close(); peer = null; pendingIce = [];
          setStatus("Connecting to teacher…");
        }
        if (data.callId) activeCallId = data.callId;
        for (const message of data.messages ?? []) {
          cursor = message.id;
          activeCallId = message.callId || activeCallId;
          if (message.type === "close") {
            peer?.close(); peer = null; pendingIce = [];
            setStatus("Camera on · waiting for teacher");
          } else if (message.type === "offer" && message.payload) {
            const connection = createPeer(iceServers);
            await connection.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
            for (const candidate of pendingIce) await connection.addIceCandidate(candidate);
            pendingIce = [];
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await sendSignal(attemptId, activeCallId, "answer", connection.localDescription?.toJSON() ?? answer);
            setStatus("Connecting to teacher…");
          } else if (message.type === "ice" && message.payload) {
            const candidate = message.payload as RTCIceCandidateInit;
            if (peer?.remoteDescription) await peer.addIceCandidate(candidate);
            else pendingIce.push(candidate);
          }
        }
      } catch { /* retry on the next short polling interval */ }
    };
    void poll();
    const timer = window.setInterval(() => { if (!stopped) void poll(); }, 800);
    return () => { stopped = true; window.clearInterval(timer); peer?.close(); };
  }, [attemptId, stream]);

  return <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "10px 0", padding: "7px 10px", borderRadius: 8, background: "#f0fdf4", color: "#166534", fontSize: 13 }}>
    <video ref={preview} autoPlay muted playsInline aria-label="Your camera preview" style={{ width: 54, height: 40, objectFit: "cover", borderRadius: 5, background: "#111" }} />
    <span><b>{status}</b><br/><small>Your camera is visible to authorized exam teachers while this attempt is active.</small></span>
  </div>;
}
