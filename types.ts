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

// Free TURN servers for production (may have rate limits)
// For production, consider using a paid TURN service like Twilio, Metered, or Cloudflare
const getIceServers = () => {
  const servers: RTCIceServer[] = [
    // STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ];

  // Add free TURN servers (these may have rate limits)
  // Option 1: OpenRelay (free, no auth)
  servers.push({
    urls: [
      'turn:openrelay.metered.ca:80',
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
    ],
  });

  // Option 2: FreeTURN (free, no auth)
  servers.push({
    urls: [
      'turn:freeturn.net:3478',
      'turn:freeturn.net:3478?transport=tcp',
    ],
  });

  // Option 3: OpenRelay alternative
  servers.push({
    urls: [
      'turn:relay.metered.ca:80',
      'turn:relay.metered.ca:443',
      'turn:relay.metered.ca:443?transport=tcp',
    ],
  });

  return servers;
};

export const STUN_SERVERS = {
  iceServers: getIceServers(),
};