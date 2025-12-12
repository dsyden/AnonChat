export interface RoomState {
  id: string;
  isHost: boolean;
}

// Signaling message types
export type SignalType = 'join' | 'offer' | 'answer' | 'ice-candidate' | 'leave' | 'kick';

export interface SignalMessage {
  type: SignalType;
  payload?: any;
  roomId: string;
  senderId: string;
}

export interface RTCPeerState {
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

export interface UserMediaState {
  stream: MediaStream | null;
  isAudioEnabled: boolean;
  isVideoEnabled: boolean;
  error: string | null;
}

// ICE servers for WebRTC
// STUN servers help with NAT traversal, TURN servers help with strict firewalls
// For production, consider using a paid TURN service like Twilio, Metered, or Cloudflare
const getIceServers = () => {
  const servers: RTCIceServer[] = [
    // STUN servers (no authentication required)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  // OpenRelay TURN server (free, no authentication required)
  // Note: This may have rate limits. For production, use a paid service.
  servers.push({
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
  });

  return servers;
};

export const STUN_SERVERS = {
  iceServers: getIceServers(),
};