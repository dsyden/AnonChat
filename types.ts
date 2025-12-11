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

export const STUN_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' }
  ]
};