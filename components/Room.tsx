import React, { useEffect, useState } from 'react';
import { useWebRTC } from '../hooks/useWebRTC';
import Controls from './Controls';
import Video from './Video';

interface RoomProps {
  roomId: string;
  onLeave: () => void;
}

const Room: React.FC<RoomProps> = ({ roomId, onLeave }) => {
  const { localStream, remoteStream, peerState, toggleAudio, toggleVideo, kickPeer } = useWebRTC(roomId);
  const [showCopyToast, setShowCopyToast] = useState(false);

  // 15 minute auto-cleanup logic (Client side approximation)
  useEffect(() => {
      const timer = setTimeout(() => {
          if (!peerState.isConnected) {
              // If nobody connected for 15 minutes, kick to home
              alert("Room timed out due to inactivity.");
              onLeave();
          }
      }, 15 * 60 * 1000); // 15 minutes

      return () => clearTimeout(timer);
  }, [peerState.isConnected, onLeave]);

  const copyUrl = () => {
    const url = `${window.location.origin}/#/${roomId}`;
    navigator.clipboard.writeText(url);
    setShowCopyToast(true);
    setTimeout(() => setShowCopyToast(false), 2000);
  };

  return (
    <div className="relative h-screen w-full bg-black flex items-center justify-center overflow-hidden">
      
      {/* Toast Notification */}
      <div className={`absolute top-6 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm rounded-full shadow-lg transition-all duration-300 ${showCopyToast ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'}`}>
        Link copied to clipboard!
      </div>

      {/* Main Video Layout */}
      <div className="w-full h-full flex flex-col md:flex-row relative">
        
        {/* Remote Video (Takes full screen if connected, otherwise hidden/placeholder) */}
        {remoteStream ? (
            <div className="flex-1 h-full relative">
                <Video 
                    stream={remoteStream} 
                    className="w-full h-full object-cover"
                />
            </div>
        ) : peerState.isConnecting ? (
            // CONNECTING STATE UI
            <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center relative z-10">
                <div className="w-20 h-20 bg-gray-900/60 backdrop-blur-md rounded-full flex items-center justify-center mb-6 animate-pulse border border-blue-500/50 shadow-2xl">
                     <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-400"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
                </div>
                <h2 className="text-xl md:text-3xl font-semibold text-white mb-3 drop-shadow-md tracking-tight">
                    Connecting... <span className="text-blue-400 font-mono">#{roomId}</span>
                </h2>
                <p className="text-gray-200/80 max-w-md mb-8 text-sm md:text-base font-medium drop-shadow-sm">
                    Establishing secure connection with the other participant.
                </p>
            </div>
        ) : (
            // WAITING STATE UI
            <div className="flex-1 h-full flex flex-col items-center justify-center p-8 text-center relative z-10">
                <div className="w-20 h-20 bg-gray-900/60 backdrop-blur-md rounded-full flex items-center justify-center mb-6 animate-pulse-slow border border-white/10 shadow-2xl">
                     <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/80"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>
                </div>
                <h2 className="text-xl md:text-3xl font-semibold text-white mb-3 drop-shadow-md tracking-tight">
                    Waiting for someone to join <span className="text-blue-400 font-mono">#{roomId}</span>
                </h2>
                <p className="text-gray-200/80 max-w-md mb-8 text-sm md:text-base font-medium drop-shadow-sm">
                    Share the room link with one other person to start the encrypted video call.
                </p>
                <button 
                    onClick={copyUrl} 
                    className="px-6 py-3 bg-white/90 hover:bg-white text-black font-semibold rounded-full transition-all shadow-xl shadow-black/20 hover:shadow-white/20 flex items-center gap-2 backdrop-blur-sm transform active:scale-95"
                >
                    <span>Copy Joining Link</span>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
            </div>
        )}

        {/* Local Video (Floating PiP) */}
        {/* Only visible when remote stream is active (Top Right) */}
        <div className={`
            absolute transition-all duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)] shadow-2xl border border-white/10 rounded-2xl overflow-hidden bg-gray-900 z-30
            ${remoteStream 
                ? 'top-6 right-6 w-[100px] h-[133px] md:w-[180px] md:h-[240px] opacity-100 scale-100' 
                : 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 opacity-0 scale-50' 
            }
        `}>
             <Video 
                stream={localStream} 
                isLocal={true}
                muted={true}
                className="w-full h-full object-cover"
            />
        </div>

        {/* Background Mirror Effect when waiting (Fuzzy Preview) */}
        {!remoteStream && localStream && (
             <div className="absolute inset-0 z-0 overflow-hidden">
                 {/* The fuzzy video */}
                 <Video 
                    stream={localStream} 
                    isLocal={true} 
                    muted={true} 
                    className="w-full h-full object-cover opacity-80 blur-sm scale-105" 
                 />
                 {/* Gradient overlay for better text readability */}
                 <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/80" />
             </div>
        )}
    </div>

      <Controls 
        onToggleMic={toggleAudio}
        onToggleCam={toggleVideo}
        onLeave={onLeave}
        onKick={kickPeer}
        isConnected={peerState.isConnected}
      />
    </div>
  );
};

export default Room;