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
  const localStreamRef = useRef<MediaStream | null>(null);
  
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

      console.log(`[Signaling] Received message type: ${msg.type} from ${msg.senderId}`);

      // Wait for local stream if it's not ready yet (for creating offers with media)
      if (msg.type === 'join' && !localStreamRef.current) {
        console.log('[Signaling] Waiting for local stream before handling join...');
        // Wait up to 3 seconds for local stream
        let attempts = 0;
        while (!localStreamRef.current && attempts < 30) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }
        if (!localStreamRef.current) {
          console.warn('[Signaling] Local stream not ready, proceeding without media tracks');
        }
      }

      let pc = peerConnectionRef.current;
      if (!pc) {
        console.log('[Signaling] No peer connection exists, creating one...');
        pc = createPeerConnection();
      } else {
        console.log(`[Signaling] Using existing peer connection (state: ${pc.signalingState})`);
      }

      try {
        switch (msg.type) {
          case 'join':
            // Ignore our own join messages
            if (msg.senderId === signalingService.userId) {
              console.log('[Signaling] Ignoring own join message');
              break;
            }
            
            // Polite peer strategy: user with smaller ID becomes the "polite" peer (answers)
            // User with larger ID becomes the "impolite" peer (creates offer)
            const otherUserId = msg.senderId;
            const myUserId = signalingService.userId;
            const isPolite = myUserId > otherUserId;
            
            console.log(`[Signaling] Join received - My ID: ${myUserId}, Other ID: ${otherUserId}, Is Polite: ${isPolite}`);
            console.log(`[Signaling] Current peer connection state: ${pc.signalingState}`);
            
            // Only skip if we're already in the middle of an offer/answer exchange
            // Allow if we're in 'stable' or 'closed' state (ready for new connection)
            const isInProgress = pc.signalingState === 'have-local-offer' || 
                                pc.signalingState === 'have-remote-offer' || 
                                pc.signalingState === 'have-local-pranswer' || 
                                pc.signalingState === 'have-remote-pranswer';
            
            if (isInProgress) {
              console.log(`[Signaling] Connection already in progress (state: ${pc.signalingState}), ignoring join`);
              break;
            }
            
            // If connection is closed, create a new one
            let activePc = pc;
            if (pc.signalingState === 'closed') {
              console.log('[Signaling] Previous connection closed, creating new peer connection');
              peerConnectionRef.current = null;
              activePc = createPeerConnection();
              pc = activePc; // Update pc reference for rest of handler
            }
            
            if (!isPolite) {
              // We are the impolite peer, create offer
              console.log('[Signaling] Peer joined, creating offer (impolite peer)');
              isHostRef.current = true;
              
              // Update state to show we're connecting
              setPeerState(prev => ({ ...prev, isConnecting: true, error: null }));
              
              try {
                // Ensure local stream tracks are added to peer connection
                const currentLocalStream = localStreamRef.current;
                if (currentLocalStream && activePc.getSenders().length === 0) {
                  console.log('[Signaling] Adding local stream tracks to peer connection...');
                  currentLocalStream.getTracks().forEach(track => {
                    activePc.addTrack(track, currentLocalStream);
                    console.log(`[Signaling] Added ${track.kind} track`);
                  });
                } else if (!currentLocalStream) {
                  console.warn('[Signaling] No local stream available, creating offer without media');
                }
                
                // Make sure we're in stable state
                if (activePc.signalingState !== 'stable') {
                  console.log('[Signaling] Not in stable state, rolling back');
                  await activePc.setLocalDescription({ type: 'rollback' });
                }
                
                console.log('[Signaling] Creating WebRTC offer...');
                const offer = await activePc.createOffer();
                console.log('[Signaling] Offer created, setting local description...');
                await activePc.setLocalDescription(offer);
                console.log('[Signaling] Sending offer to peer...');
                await signalingService.send({ type: 'offer', payload: offer });
                console.log('[Signaling] ✅ Offer sent successfully');
              } catch (err) {
                console.error('[Signaling] ❌ Error creating/sending offer:', err);
                setPeerState(prev => ({ ...prev, error: `Failed to create offer: ${err}` }));
              }
            } else {
              // We are the polite peer, wait for offer
              console.log('[Signaling] Peer joined, waiting for offer (polite peer)');
              isHostRef.current = false;
              // Update state to show we're waiting for connection
              setPeerState(prev => ({ ...prev, isConnecting: true }));
            }
            break;

          case 'offer':
            console.log('[Signaling] Received offer');
            
            // Update state to show we're connecting
            setPeerState(prev => ({ ...prev, isConnecting: true, error: null }));
            
            // Handle glare situation (both peers create offers simultaneously)
            if (pc.signalingState !== 'stable') {
              console.log('[Signaling] Glare detected, rolling back');
              await pc.setLocalDescription({ type: 'rollback' });
            }
            
            // Ensure local stream tracks are added before answering
            const currentLocalStreamForAnswer = localStreamRef.current;
            if (currentLocalStreamForAnswer && pc.getSenders().length === 0) {
              console.log('[Signaling] Adding local stream tracks before answering...');
              currentLocalStreamForAnswer.getTracks().forEach(track => {
                pc.addTrack(track, currentLocalStreamForAnswer);
                console.log(`[Signaling] Added ${track.kind} track`);
              });
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
  }, [roomId]); // Removed createPeerConnection from deps to prevent re-renders

  // Initial Media Setup
  useEffect(() => {
    const startLocalVideo = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: true,
        });
        setLocalStream(stream);
        localStreamRef.current = stream; // Update ref for message handler
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