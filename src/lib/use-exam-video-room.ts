"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type ExamRoomParticipant = {
  participantId: string;
  role: "candidate" | "teacher";
  displayName: string;
};

type RoomSignal = {
  id: string;
  fromId: string;
  type: "offer" | "answer" | "ice";
  payload: RTCSessionDescriptionInit | RTCIceCandidateInit;
};

type RoomResponse = {
  participantId: string;
  peers: ExamRoomParticipant[];
  messages: RoomSignal[];
  iceServers?: RTCIceServer[];
};

export type RemoteExamVideo = ExamRoomParticipant & { stream: MediaStream };

async function sendRoomSignal(attemptId: string, sessionId: string, targetId: string, type: RoomSignal["type"], payload: RoomSignal["payload"]) {
  const response = await fetch(`/api/exam-video/${encodeURIComponent(attemptId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, targetId, type, payload }),
  });
  if (!response.ok) throw new Error("Could not exchange live-room connection data.");
}

export function useExamVideoRoom(attemptId: string, localStream: MediaStream | null, role: "candidate" | "teacher") {
  const [remoteVideos, setRemoteVideos] = useState<RemoteExamVideo[]>([]);
  const [remoteAudioStreams, setRemoteAudioStreams] = useState<{ participantId: string; stream: MediaStream }[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [error, setError] = useState("");
  const connectionsRef = useRef(new Map<string, RTCPeerConnection>());
  const outgoingAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  const setOutgoingAudioTrack = useCallback(async (track: MediaStreamTrack | null) => {
    outgoingAudioTrackRef.current = track;
    await Promise.all([...connectionsRef.current.values()].map(async connection => {
      const sender = connection.getTransceivers().find(transceiver => transceiver.receiver.track.kind === "audio")?.sender;
      if (sender) await sender.replaceTrack(track);
    }));
  }, []);

  useEffect(() => {
    if (role === "candidate" && !localStream) {
      setRemoteVideos([]);
      setIsLive(false);
      setRemoteAudioStreams([]);
      return;
    }

    let stopped = false;
    let polling = false;
    let cursor = "";
    let needsIceServers = true;
    let iceServers: RTCIceServer[] = [];
    const sessionId = crypto.randomUUID();
    const connections = new Map<string, RTCPeerConnection>();
    connectionsRef.current = connections;
    const participants = new Map<string, ExamRoomParticipant>();
    const pendingIce = new Map<string, RTCIceCandidateInit[]>();

    const removeRemoteVideo = (participantId: string) => {
      setRemoteVideos(current => current.filter(participant => participant.participantId !== participantId));
    };

    const closePeer = (participantId: string) => {
      connections.get(participantId)?.close();
      connections.delete(participantId);
      if (connectionsRef.current === connections) connectionsRef.current.delete(participantId);
      pendingIce.delete(participantId);
      removeRemoteVideo(participantId);
      setRemoteAudioStreams(current => current.filter(item => item.participantId !== participantId));
    };

    const createPeer = (participant: ExamRoomParticipant) => {
      const connection = new RTCPeerConnection({
        iceServers: iceServers.length ? iceServers : [{ urls: "stun:stun.l.google.com:19302" }],
        iceTransportPolicy: "all",
      });
      connections.set(participant.participantId, connection);
      participants.set(participant.participantId, participant);
      if (role === "candidate" && localStream) {
        localStream.getVideoTracks().forEach(track => connection.addTrack(track, localStream));
        const audio = connection.addTransceiver("audio", { direction: "sendrecv" });
        void audio.sender.replaceTrack(outgoingAudioTrackRef.current);
      } else if (role === "teacher") {
        connection.addTransceiver("video", { direction: "recvonly" });
        const audio = connection.addTransceiver("audio", { direction: "sendrecv" });
        void audio.sender.replaceTrack(outgoingAudioTrackRef.current);
      }
      connection.onicecandidate = event => {
        if (event.candidate) {
          void sendRoomSignal(attemptId, sessionId, participant.participantId, "ice", event.candidate.toJSON()).catch(cause => {
            if (!stopped) setError(cause instanceof Error ? cause.message : "Live-room network error.");
          });
        }
      };
      connection.ontrack = event => {
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        if (event.track.kind === "audio") {
          setRemoteAudioStreams(current => {
            const next = current.filter(item => item.participantId !== participant.participantId);
            next.push({ participantId: participant.participantId, stream });
            return next;
          });
          return;
        }
        const peerInfo = participants.get(participant.participantId) ?? participant;
        setRemoteVideos(current => {
          const next = current.filter(item => item.participantId !== peerInfo.participantId);
          next.push({ ...peerInfo, stream });
          return next;
        });
      };
      connection.onconnectionstatechange = () => {
        if (!stopped) setIsLive([...connections.values()].some(peer => peer.connectionState === "connected"));
      };
      connection.oniceconnectionstatechange = () => {
        if (connection.iceConnectionState === "failed") {
          if (!stopped) setError("A live-room network connection failed. Check the relay configuration.");
        }
      };
      return connection;
    };

    const poll = async () => {
      if (polling || stopped) return;
      polling = true;
      try {
        const query = new URLSearchParams({ sessionId, after: cursor });
        if (needsIceServers) query.set("includeIceServers", "1");
        const response = await fetch(`/api/exam-video/${encodeURIComponent(attemptId)}?${query}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Live room is unavailable (${response.status}).`);
        const data = await response.json() as RoomResponse;
        if (Array.isArray(data.iceServers)) {
          iceServers = data.iceServers;
          needsIceServers = false;
        }
        setError("");

        const expectedRole = role === "candidate" ? "teacher" : "candidate";
        const roomPeers = data.peers.filter(peer => peer.role === expectedRole);
        const activeIds = new Set(roomPeers.map(peer => peer.participantId));
        for (const participantId of connections.keys()) {
          if (!activeIds.has(participantId)) closePeer(participantId);
        }
        for (const participant of roomPeers) {
          participants.set(participant.participantId, participant);
          if (connections.has(participant.participantId)) continue;
          const connection = createPeer(participant);
          if (role === "teacher") {
            const offer = await connection.createOffer();
            await connection.setLocalDescription(offer);
            await sendRoomSignal(attemptId, sessionId, participant.participantId, "offer", connection.localDescription?.toJSON() ?? offer);
          }
        }

        for (const message of data.messages) {
          cursor = message.id;
          const connection = connections.get(message.fromId);
          if (!connection) continue;
          if (message.type === "offer" && connection.signalingState === "stable") {
            await connection.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
            for (const candidate of pendingIce.get(message.fromId) ?? []) await connection.addIceCandidate(candidate);
            pendingIce.delete(message.fromId);
            const answer = await connection.createAnswer();
            await connection.setLocalDescription(answer);
            await sendRoomSignal(attemptId, sessionId, message.fromId, "answer", connection.localDescription?.toJSON() ?? answer);
          } else if (message.type === "answer" && connection.signalingState === "have-local-offer") {
            await connection.setRemoteDescription(message.payload as RTCSessionDescriptionInit);
            for (const candidate of pendingIce.get(message.fromId) ?? []) await connection.addIceCandidate(candidate);
            pendingIce.delete(message.fromId);
          } else if (message.type === "ice") {
            const candidate = message.payload as RTCIceCandidateInit;
            if (connection.remoteDescription) await connection.addIceCandidate(candidate);
            else pendingIce.set(message.fromId, [...(pendingIce.get(message.fromId) ?? []), candidate]);
          }
        }
      } catch (cause) {
        if (!stopped) setError(cause instanceof Error ? cause.message : "Live-room connection failed.");
      } finally {
        polling = false;
      }
    };

    void poll();
    const timer = window.setInterval(() => void poll(), 1200);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      for (const connection of connections.values()) connection.close();
      connections.clear();
      if (connectionsRef.current === connections) connectionsRef.current = new Map();
      void fetch(`/api/exam-video/${encodeURIComponent(attemptId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "leave", sessionId }),
      }).catch(() => undefined);
    };
  }, [attemptId, localStream, role]);

  return { remoteVideos, remoteAudioStreams, isLive, error, setOutgoingAudioTrack };
}
