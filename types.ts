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
// STUN servers help with NAT traversal
// For production with strict firewalls, consider using a paid TURN service like Twilio, Metered, or Cloudflare
// Note: Free TURN servers typically require authentication, so we're using STUN only for now
const getIceServers = () => {
  const servers: RTCIceServer[] = [
    // STUN servers (no authentication required)
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ];

  // Removed TURN servers - they require authentication
  // For production, add a paid TURN service here with credentials:
  // servers.push({
  //   urls: 'turn:your-turn-server.com:3478',
  //   username: 'your-username',
  //   credential: 'your-credential'
  // });

  return servers;
};

export const STUN_SERVERS = {
  iceServers: getIceServers(),
};