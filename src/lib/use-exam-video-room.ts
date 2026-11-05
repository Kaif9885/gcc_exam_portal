"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Room, RoomEvent, Track, type RemoteParticipant, type RemoteTrack } from "livekit-client";

export type ExamRoomParticipant = {
  participantId: string;
  role: "candidate" | "teacher";
  displayName: string;
};

export type RemoteExamVideo = ExamRoomParticipant & { stream: MediaStream };
type LiveKitRole = ExamRoomParticipant["role"];
type LiveKitRoomResponse = { url: string; token: string; identity: string; role: LiveKitRole; error?: string };

export function useExamVideoRoom(attemptId: string, localStream: MediaStream | null, role: LiveKitRole) {
  const [remoteVideos, setRemoteVideos] = useState<RemoteExamVideo[]>([]);
  const [remoteAudioStreams, setRemoteAudioStreams] = useState<{ participantId: string; stream: MediaStream }[]>([]);
  const [isLive, setIsLive] = useState(false);
  const [cameraPublished, setCameraPublished] = useState(false);
  const [error, setError] = useState("");
  const roomRef = useRef<Room | null>(null);
  const outgoingAudioTrackRef = useRef<MediaStreamTrack | null>(null);
  const publishedAudioRef = useRef<MediaStreamTrack | null>(null);

  const setOutgoingAudioTrack = useCallback(async (track: MediaStreamTrack | null) => {
    outgoingAudioTrackRef.current = track;
    const room = roomRef.current;
    if (!room || room.state !== "connected") return;

    const currentlyPublished = publishedAudioRef.current;
    if (currentlyPublished && currentlyPublished !== track) {
      await room.localParticipant.unpublishTrack(currentlyPublished, false);
      publishedAudioRef.current = null;
    }
    if (track && publishedAudioRef.current !== track) {
      await room.localParticipant.publishTrack(track, { source: Track.Source.Microphone });
      publishedAudioRef.current = track;
    }
  }, []);

  const startAudioPlayback = useCallback(async () => {
    const room = roomRef.current;
    if (room) await room.startAudio();
  }, []);

  useEffect(() => {
    if (role === "candidate" && !localStream) {
      setRemoteVideos([]);
      setRemoteAudioStreams([]);
      setIsLive(false);
      setCameraPublished(false);
      return;
    }

    let stopped = false;
    const room = new Room({ adaptiveStream: true, dynacast: true });
    const videoTracks = new Map<string, RemoteExamVideo>();
    const audioTracks = new Map<string, MediaStream>();
    roomRef.current = room;

    const handleTrackSubscribed = (track: RemoteTrack, _publication: unknown, participant: RemoteParticipant) => {
      let metadata: { role?: LiveKitRole } = {};
      try { if (participant.metadata) metadata = JSON.parse(participant.metadata) as { role?: LiveKitRole }; } catch { /* use the safe teacher fallback */ }
      const participantInfo: ExamRoomParticipant = {
        participantId: participant.identity,
        role: metadata.role === "candidate" ? "candidate" : "teacher",
        displayName: participant.name || (metadata.role === "candidate" ? "Student" : "Teacher"),
      };
      const stream = new MediaStream([track.mediaStreamTrack]);
      if (track.kind === Track.Kind.Video) {
        videoTracks.set(participant.identity, { ...participantInfo, stream });
        setRemoteVideos([...videoTracks.values()]);
      } else {
        audioTracks.set(participant.identity, stream);
        setRemoteAudioStreams([...audioTracks].map(([participantId, remoteStream]) => ({ participantId, stream: remoteStream })));
      }
    };

    const handleTrackUnsubscribed = (track: RemoteTrack, _publication: unknown, participant: RemoteParticipant) => {
      track.detach();
      if (track.kind === Track.Kind.Video) {
        videoTracks.delete(participant.identity);
        setRemoteVideos([...videoTracks.values()]);
      } else {
        audioTracks.delete(participant.identity);
        setRemoteAudioStreams([...audioTracks].map(([participantId, stream]) => ({ participantId, stream })));
      }
    };

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, handleTrackUnsubscribed);
    room.on(RoomEvent.Connected, () => { if (!stopped) { setIsLive(true); setError(""); } });
    room.on(RoomEvent.Reconnected, () => { if (!stopped) { setIsLive(true); setError(""); } });
    room.on(RoomEvent.Reconnecting, () => { if (!stopped) setIsLive(false); });
    room.on(RoomEvent.Disconnected, () => {
      setIsLive(false);
      setCameraPublished(false);
      setRemoteVideos([]);
      setRemoteAudioStreams([]);
    });
    room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      if (room.canPlaybackAudio) setError("");
    });

    const connect = async () => {
      try {
        const response = await fetch(`/api/exam-video/${encodeURIComponent(attemptId)}/token`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: crypto.randomUUID() }),
          cache: "no-store",
        });
        const data = await response.json() as LiveKitRoomResponse;
        if (!response.ok) throw new Error(data.error || "Could not authorize the live exam connection.");
        if (stopped) return;
        await room.connect(data.url, data.token, { autoSubscribe: true });

        if (role === "candidate" && localStream) {
          const cameraTrack = localStream.getVideoTracks()[0];
          if (cameraTrack) {
            await room.localParticipant.publishTrack(cameraTrack, { source: Track.Source.Camera, simulcast: true });
            if (!stopped) setCameraPublished(true);
          } else {
            throw new Error("The camera is on, but no video track is available to stream.");
          }
        }
        if (outgoingAudioTrackRef.current) await setOutgoingAudioTrack(outgoingAudioTrackRef.current);
      } catch (cause) {
        if (!stopped) {
          setIsLive(false);
          setCameraPublished(false);
          setError(cause instanceof Error ? cause.message : "Could not join the live exam room.");
        }
      }
    };

    void connect();
    return () => {
      stopped = true;
      room.removeAllListeners();
      if (roomRef.current === room) roomRef.current = null;
      publishedAudioRef.current = null;
      void room.disconnect(true);
    };
  }, [attemptId, localStream, role, setOutgoingAudioTrack]);

  return { remoteVideos, remoteAudioStreams, isLive, cameraPublished, error, setOutgoingAudioTrack, startAudioPlayback };
}
