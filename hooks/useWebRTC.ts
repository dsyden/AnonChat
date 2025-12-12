import { useState, useEffect, useRef, useCallback } from 'react';
import { signalingService } from '../services/SignalingService';
import { RTCPeerState, STUN_SERVERS } from '../types';

export const useWebRTC = (roomId: string) => {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [peerState, setPeerState] = useState<RTCPeerState>({
    isConnected: false,
    isConnecting: false,
    error: null,
  });

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const isHostRef = useRef<boolean>(false);
  const pendingIceCandidatesRef = useRef<RTCIceCandidate[]>([]);
  const hasRemoteDescriptionRef = useRef<boolean>(false);
  
  // Initialize Peer Connection
  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    console.log('[WebRTC] Creating RTCPeerConnection');
    const pc = new RTCPeerConnection(STUN_SERVERS);
    hasRemoteDescriptionRef.current = false;
    pendingIceCandidatesRef.current = [];

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingService.send({
          type: 'ice-candidate',
          payload: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track');
      setRemoteStream(event.streams[0]);
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] Connection state:', state);
      switch (state) {
        case 'connected':
          setPeerState({ isConnected: true, isConnecting: false, error: null });
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
           // If we lose connection, we reset remote stream but keep local
          setPeerState({ isConnected: false, isConnecting: false, error: `Connection ${state}` });
          setRemoteStream(null);
          break;
        case 'connecting':
          setPeerState(prev => ({ ...prev, isConnecting: true }));
          break;
      }
    };

    // Monitor ICE connection state
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log('[WebRTC] ICE connection state:', iceState);
      if (iceState === 'failed' || iceState === 'disconnected') {
        console.warn('[WebRTC] ICE connection issue:', iceState);
        setPeerState(prev => ({ 
          ...prev, 
          error: `ICE connection ${iceState}. This may indicate NAT traversal issues.` 
        }));
      }
    };

    // Monitor ICE gathering state
    pc.onicegatheringstatechange = () => {
      console.log('[WebRTC] ICE gathering state:', pc.iceGatheringState);
    };

    // Log ICE candidates for debugging
    pc.onicecandidateerror = (event) => {
      console.error('[WebRTC] ICE candidate error:', event);
    };

    // Add local tracks if stream exists
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    peerConnectionRef.current = pc;
    return pc;
  }, [localStream]);

  // Handle incoming signaling messages
  useEffect(() => {
    let isMounted = true;

    const setupSignaling = async () => {
      try {
        await signalingService.connect(roomId);
        
        // Wait a bit to ensure we're subscribed, then announce presence
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (isMounted) {
          // Announce presence
          await signalingService.send({ type: 'join' });
        }
      } catch (err) {
        console.error('[WebRTC] Failed to connect to signaling service', err);
        setPeerState(prev => ({ ...prev, error: 'Failed to connect to signaling service' }));
      }
    };

    setupSignaling();

    const cleanupListener = signalingService.onMessage(async (msg) => {
      if (!isMounted) return;

      const pc = peerConnectionRef.current || createPeerConnection();

      try {
        switch (msg.type) {
          case 'join':
            // Polite peer strategy: user with smaller ID becomes the "polite" peer (answers)
            // User with larger ID becomes the "impolite" peer (creates offer)
            const otherUserId = msg.senderId;
            const isPolite = signalingService.userId > otherUserId;
            
            if (!isPolite) {
              // We are the impolite peer, create offer
              console.log('[Signaling] Peer joined, creating offer (impolite peer)');
              isHostRef.current = true;
              
              // Make sure we're in stable state
              if (pc.signalingState !== 'stable') {
                await pc.setLocalDescription({ type: 'rollback' });
              }
              
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              await signalingService.send({ type: 'offer', payload: offer });
            } else {
              // We are the polite peer, wait for offer
              console.log('[Signaling] Peer joined, waiting for offer (polite peer)');
              isHostRef.current = false;
            }
            break;

          case 'offer':
            console.log('[Signaling] Received offer');
            
            // Handle glare situation (both peers create offers simultaneously)
            if (pc.signalingState !== 'stable') {
              console.log('[Signaling] Glare detected, rolling back');
              await pc.setLocalDescription({ type: 'rollback' });
            }
            
            await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
            hasRemoteDescriptionRef.current = true;
            
            // Process any pending ICE candidates
            while (pendingIceCandidatesRef.current.length > 0) {
              const candidate = pendingIceCandidatesRef.current.shift();
              if (candidate) {
                try {
                  await pc.addIceCandidate(candidate);
                } catch (err) {
                  console.warn('[WebRTC] Failed to add queued ICE candidate', err);
                }
              }
            }
            
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await signalingService.send({ type: 'answer', payload: answer });
            break;

          case 'answer':
            console.log('[Signaling] Received answer');
            if (pc.signalingState === 'have-local-offer') {
              await pc.setRemoteDescription(new RTCSessionDescription(msg.payload));
              hasRemoteDescriptionRef.current = true;
              
              // Process any pending ICE candidates
              while (pendingIceCandidatesRef.current.length > 0) {
                const candidate = pendingIceCandidatesRef.current.shift();
                if (candidate) {
                  try {
                    await pc.addIceCandidate(candidate);
                  } catch (err) {
                    console.warn('[WebRTC] Failed to add queued ICE candidate', err);
                  }
                }
              }
            }
            break;

          case 'ice-candidate':
            if (msg.payload) {
              const candidate = new RTCIceCandidate(msg.payload);
              
              // If we don't have remote description yet, queue the candidate
              if (!hasRemoteDescriptionRef.current) {
                console.log('[WebRTC] Queueing ICE candidate (no remote description yet)');
                pendingIceCandidatesRef.current.push(candidate);
              } else {
                try {
                  await pc.addIceCandidate(candidate);
                } catch (err) {
                  console.warn('[WebRTC] Failed to add ICE candidate', err);
                }
              }
            }
            break;
            
          case 'leave':
            console.log('[Signaling] Peer left');
            setRemoteStream(null);
            setPeerState({ isConnected: false, isConnecting: false, error: 'Peer disconnected' });
            if (peerConnectionRef.current) {
                peerConnectionRef.current.close();
                peerConnectionRef.current = null;
            }
            // Re-initialize for next person
            peerConnectionRef.current = null;
            hasRemoteDescriptionRef.current = false;
            pendingIceCandidatesRef.current = [];
            createPeerConnection();
            break;
            
          case 'kick':
            console.log('[Signaling] Kicked from room');
            window.location.hash = '/'; // Simple redirect
            break;
        }
      } catch (err) {
        console.error('[WebRTC] Signaling error', err);
      }
    });

    return () => {
      isMounted = false;
      cleanupListener();
      signalingService.disconnect();
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      pendingIceCandidatesRef.current = [];
      hasRemoteDescriptionRef.current = false;
    };
  }, [roomId, createPeerConnection]);

  // Initial Media Setup
  useEffect(() => {
    const startLocalVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true,
        });
        setLocalStream(stream);
      } catch (e) {
        console.error('Error accessing media devices.', e);
        setPeerState(prev => ({ ...prev, error: 'Camera/Mic access denied' }));
      }
    };

    startLocalVideo();

    return () => {
      // Stop all tracks on unmount
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync tracks when local stream is ready or changes
  useEffect(() => {
    if (localStream && peerConnectionRef.current) {
      const pc = peerConnectionRef.current;
      // Replace tracks if they exist, or add them
      const senders = pc.getSenders();
      localStream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track?.kind === track.kind);
        if (sender) {
            sender.replaceTrack(track);
        } else {
            pc.addTrack(track, localStream);
        }
      });
    }
  }, [localStream]);

  const toggleAudio = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) audioTrack.enabled = !audioTrack.enabled;
      return audioTrack?.enabled; // Return new state
    }
    return false;
  };

  const toggleVideo = () => {
    if (localStream) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) videoTrack.enabled = !videoTrack.enabled;
      return videoTrack?.enabled; // Return new state
    }
    return false;
  };
  
  const kickPeer = () => {
      signalingService.send({ type: 'kick' });
  };

  return {
    localStream,
    remoteStream,
    peerState,
    toggleAudio,
    toggleVideo,
    kickPeer
  };
};