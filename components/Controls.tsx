import React, { useState } from 'react';

interface ControlsProps {
  onToggleMic: () => boolean;
  onToggleCam: () => boolean;
  onLeave: () => void;
  onKick: () => void;
  isConnected: boolean;
}

const Controls: React.FC<ControlsProps> = ({ onToggleMic, onToggleCam, onLeave, onKick, isConnected }) => {
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  const handleMic = () => setMicOn(onToggleMic());
  const handleCam = () => setCamOn(onToggleCam());

  return (
    <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-2 px-4 py-2 bg-gray-950/80 backdrop-blur-xl rounded-full border border-white/10 shadow-2xl z-50 transition-all duration-300">
      {/* Mic Toggle */}
      <button
        onClick={handleMic}
        className={`p-3 rounded-full transition-all duration-200 group ${
          micOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/90 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
        }`}
        title={micOn ? "Mute Microphone" : "Unmute Microphone"}
      >
        {micOn ? (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6"/><path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        )}
      </button>

      {/* Camera Toggle */}
      <button
        onClick={handleCam}
        className={`p-3 rounded-full transition-all duration-200 group ${
          camOn ? 'bg-white/10 hover:bg-white/20 text-white' : 'bg-red-500/90 hover:bg-red-600 text-white shadow-lg shadow-red-500/20'
        }`}
        title={camOn ? "Turn Off Camera" : "Turn On Camera"}
      >
        {camOn ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:scale-110 transition-transform"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>
        ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
        )}
      </button>

      {/* Kick Peer Button (Only show if connected) */}
      {isConnected && (
         <button
         onClick={() => {
             if (window.confirm("Are you sure you want to kick the other participant?")) {
                 onKick();
             }
         }}
         className="p-3 rounded-full bg-white/10 hover:bg-orange-600/90 text-white transition-all duration-200 group"
         title="Kick Participant"
       >
         <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:text-white group-hover:scale-110 transition-transform"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="18" y1="8" x2="23" y2="13"/><line x1="23" y1="8" x2="18" y2="13"/></svg>
       </button>
      )}

      {/* End Call */}
      <button
        onClick={onLeave}
        className="p-3 rounded-full bg-red-600 hover:bg-red-700 text-white transition-all duration-200 shadow-lg shadow-red-600/30 group"
        title="Leave Room"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="group-hover:rotate-90 transition-transform"><path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/></svg>
      </button>
    </div>
  );
};

export default Controls;