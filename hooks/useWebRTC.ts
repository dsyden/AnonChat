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
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const isConnectedRef = useRef<boolean>(false);
  const isConnectingRef = useRef<boolean>(false);
  const processedJoinsRef = useRef<Set<string>>(new Set()); // Track processed join messages
  
  // Initialize Peer Connection
  const createPeerConnection = useCallback(() => {
    if (peerConnectionRef.current) return peerConnectionRef.current;

    console.log('[WebRTC] Creating RTCPeerConnection');
    const pc = new RTCPeerConnection(STUN_SERVERS);
    hasRemoteDescriptionRef.current = false;
    pendingIceCandidatesRef.current = [];
    remoteStreamRef.current = null; // Reset remote stream when creating new connection

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        signalingService.send({
          type: 'ice-candidate',
          payload: event.candidate,
        });
      }
    };

    pc.ontrack = (event) => {
      console.log('[WebRTC] Received remote track:', event.track.kind, event.track.id, 'enabled:', event.track.enabled);
      console.log('[WebRTC] Streams in event:', event.streams.length);
      
      // Get or create remote stream
      let stream = remoteStreamRef.current;
      if (!stream) {
        console.log('[WebRTC] Creating new remote stream');
        stream = new MediaStream();
        remoteStreamRef.current = stream;
      }
      
      // Add the track to the stream if it's not already there
      const existingTrack = stream.getTracks().find(t => t.id === event.track.id);
      if (!existingTrack) {
        console.log('[WebRTC] Adding track to remote stream');
        stream.addTrack(event.track);
      } else {
        console.log('[WebRTC] Track already in stream, replacing');
        stream.removeTrack(existingTrack);
        stream.addTrack(event.track);
      }
      
      console.log('[WebRTC] Remote stream now has tracks:', stream.getTracks().map(t => `${t.kind}:${t.id}:${t.enabled ? 'enabled' : 'disabled'}`));
      
      // Force React to update by creating a new stream reference
      const streamToSet = new MediaStream(stream.getTracks());
      remoteStreamRef.current = streamToSet;
      setRemoteStream(streamToSet);
      console.log('[WebRTC] ✅ Remote stream updated in state');
    };

    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log('[WebRTC] Connection state:', state);
      switch (state) {
        case 'connected':
          isConnectedRef.current = true;
          isConnectingRef.current = false;
          setPeerState({ isConnected: true, isConnecting: false, error: null });
          break;
        case 'disconnected':
        case 'failed':
        case 'closed':
           // If we lose connection, we reset remote stream but keep local
          isConnectedRef.current = false;
          isConnectingRef.current = false;
          setPeerState({ isConnected: false, isConnecting: false, error: `Connection ${state}` });
          setRemoteStream(null);
          break;
        case 'connecting':
          isConnectingRef.current = true;
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

    // Set up message handler FIRST, before connecting
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
        console.log(`[Signaling] Processing message: ${msg.type} from ${msg.senderId}, my ID: ${signalingService.userId}`);
        switch (msg.type) {
          case 'join':
            // Ignore our own join messages
            if (msg.senderId === signalingService.userId) {
              console.log('[Signaling] Ignoring own join message');
              break;
            }
            
            // Deduplicate: ignore if we've already processed this join
            const joinKey = `${msg.senderId}-${roomId}`;
            if (processedJoinsRef.current.has(joinKey)) {
              console.log(`[Signaling] Already processed join from ${msg.senderId}, ignoring duplicate`);
              break;
            }
            
            // If we're already connecting or connected, ignore duplicate joins
            if (isConnectingRef.current || isConnectedRef.current) {
              console.log('[Signaling] Already connecting/connected, ignoring join');
              break;
            }
            
            // Mark as processed
            processedJoinsRef.current.add(joinKey);
            
            // Stop periodic resend since we got a response
            clearInterval(joinResendInterval);
            
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
              processedJoinsRef.current.delete(joinKey); // Allow retry if connection fails
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
              
              // Update state to show we're connecting - this will update the UI
              isConnectingRef.current = true;
              isConnectedRef.current = false;
              setPeerState(prev => ({ 
                ...prev, 
                isConnecting: true, 
                error: null,
                isConnected: false 
              }));
              console.log('[Signaling] ✅ Updated state to connecting - UI should update now');
              
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
              isConnectingRef.current = true;
              setPeerState(prev => ({ ...prev, isConnecting: true }));
              console.log('[Signaling] ✅ Updated state to connecting (polite peer) - UI should update now');
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
            
            // Stop remote stream tracks
            if (remoteStreamRef.current) {
              remoteStreamRef.current.getTracks().forEach(track => track.stop());
              remoteStreamRef.current = null;
            }
            setRemoteStream(null);
            
            // Reset connection state refs
            isConnectedRef.current = false;
            isConnectingRef.current = false;
            setPeerState({ isConnected: false, isConnecting: false, error: 'Peer disconnected' });
            
            // Clean up peer connection
            if (peerConnectionRef.current) {
              console.log('[Signaling] Closing peer connection after peer left...');
              // Stop all senders
              peerConnectionRef.current.getSenders().forEach(sender => {
                if (sender.track) {
                  sender.track.stop();
                }
              });
              peerConnectionRef.current.close();
              peerConnectionRef.current = null;
            }
            
            // Reset state for next person
            hasRemoteDescriptionRef.current = false;
            pendingIceCandidatesRef.current = [];
            
            // Reset resend counter for next connection attempt
            resendCount = 0;
            processedJoinsRef.current.clear(); // Clear processed joins for next connection
            
            // Create new peer connection for next person
            console.log('[Signaling] Ready for next peer to join');
            break;
            
          case 'kick':
            console.log('[Signaling] Kicked from room');
            window.location.hash = '/'; // Simple redirect
            break;
        }
      } catch (err) {
        console.error('[WebRTC] Signaling error', err);
        console.error('[WebRTC] Error details:', {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
          msgType: msg.type,
          senderId: msg.senderId
        });
        setPeerState(prev => ({ 
          ...prev, 
          error: `Signaling error: ${err instanceof Error ? err.message : String(err)}` 
        }));
      }
    });

    const setupSignaling = async () => {
      try {
        await signalingService.connect(roomId);
        
        // Wait a bit to ensure we're subscribed, then announce presence
        await new Promise(resolve => setTimeout(resolve, 200));
        
        if (isMounted) {
          // Announce presence - send join message
          console.log('[Signaling] Announcing presence in room...');
          await signalingService.send({ type: 'join' });
          console.log('[Signaling] ✅ Join message sent');
        }
      } catch (err) {
        console.error('[WebRTC] Failed to connect to signaling service', err);
        setPeerState(prev => ({ ...prev, error: 'Failed to connect to signaling service' }));
      }
    };

    setupSignaling();
    
    // Also set up a periodic join message resend in case the other person missed it
    // This helps when the first person joins before the second person subscribes
    // Stop after 10 seconds to avoid spam
    let resendCount = 0;
    const maxResends = 5; // 5 resends = 10 seconds
    const joinResendInterval = setInterval(() => {
      if (isMounted && !isConnectedRef.current && !isConnectingRef.current && resendCount < maxResends) {
        resendCount++;
        console.log(`[Signaling] Resending join message (attempt ${resendCount}/${maxResends})...`);
        signalingService.send({ type: 'join' }).catch(err => {
          console.warn('[Signaling] Failed to resend join:', err);
        });
      } else if (isConnectingRef.current || isConnectedRef.current) {
        // Stop resending if we're connecting or connected
        clearInterval(joinResendInterval);
      }
    }, 2000); // Resend every 2 seconds if not connected

    return () => {
      console.log('[WebRTC] Cleaning up signaling and peer connection...');
      isMounted = false;
      clearInterval(joinResendInterval);
      
      // Send leave message before disconnecting
      try {
        signalingService.send({ type: 'leave' });
      } catch (err) {
        console.warn('[WebRTC] Error sending leave message:', err);
      }
      
      // Clean up peer connection
      if (peerConnectionRef.current) {
        console.log('[WebRTC] Closing peer connection...');
        // Stop all senders
        peerConnectionRef.current.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.stop();
          }
        });
        // Close the connection
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
      }
      
      // Stop remote stream tracks
      if (remoteStreamRef.current) {
        console.log('[WebRTC] Stopping remote stream tracks...');
        remoteStreamRef.current.getTracks().forEach(track => track.stop());
        remoteStreamRef.current = null;
      }
      
      // Clean up signaling
      cleanupListener();
      signalingService.disconnect();
      
      // Reset state
      pendingIceCandidatesRef.current = [];
      hasRemoteDescriptionRef.current = false;
      processedJoinsRef.current.clear();
      isConnectedRef.current = false;
      isConnectingRef.current = false;
      setRemoteStream(null);
      setPeerState({ isConnected: false, isConnecting: false, error: null });
      
      console.log('[WebRTC] Cleanup complete');
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
      console.log('[WebRTC] Cleaning up local media stream...');
      // Stop all tracks on unmount - use ref to avoid stale closure
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          console.log(`[WebRTC] Stopping ${track.kind} track`);
          track.stop();
        });
        localStreamRef.current = null;
      }
      // Also stop state stream if it exists
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
      setLocalStream(null);
      console.log('[WebRTC] Local media cleanup complete');
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