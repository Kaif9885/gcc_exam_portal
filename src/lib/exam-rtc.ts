export function getExamRtcConfiguration(): RTCConfiguration {
  const turnUrls = (process.env.NEXT_PUBLIC_TURN_URL ?? "")
    .split(",")
    .map(url => url.trim())
    .filter(Boolean);
  const iceServers: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

  if (turnUrls.length) {
    iceServers.push({
      urls: turnUrls,
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }

  return { iceServers, iceTransportPolicy: "all" };
}
