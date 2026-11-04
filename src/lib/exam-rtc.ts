export function getExamRtcConfiguration(iceServers?: RTCIceServer[]): RTCConfiguration {
  return {
    iceServers: iceServers?.length ? iceServers : [{ urls: "stun:stun.l.google.com:19302" }],
    iceTransportPolicy: "all",
  };
}
