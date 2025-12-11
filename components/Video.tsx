import React, { useEffect, useRef } from 'react';

interface VideoProps {
  stream: MediaStream | null;
  muted?: boolean;
  isLocal?: boolean;
  className?: string;
  label?: string;
}

const Video: React.FC<VideoProps> = ({ stream, muted = false, isLocal = false, className = "", label }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className={`relative overflow-hidden bg-gray-900 rounded-xl ${className}`}>
        {stream ? (
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={muted} // Always mute local video to prevent feedback
                className={`w-full h-full object-cover ${isLocal ? 'scale-x-[-1]' : ''}`}
            />
        ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-500">
                <div className="flex flex-col items-center gap-2">
                     <div className="w-12 h-12 rounded-full border-2 border-gray-700 border-t-blue-500 animate-spin"></div>
                     <span className="text-sm">Connecting...</span>
                </div>
            </div>
        )}
        
        {label && (
             <div className="absolute bottom-4 left-4 bg-black/50 backdrop-blur px-3 py-1 rounded-lg text-xs font-medium text-white/90">
                {label}
             </div>
        )}
    </div>
  );
};

export default Video;