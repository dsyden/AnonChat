import React, { useState, useEffect } from 'react';
import LandingPage from './components/LandingPage';
import Room from './components/Room';

// Simple Hash Router Implementation to avoid needing a server for routing in this demo context
const App: React.FC = () => {
  const [currentRoom, setCurrentRoom] = useState<string | null>(null);

  useEffect(() => {
    // Check hash on load
    const checkHash = () => {
      const hash = window.location.hash.replace('#/', '');
      if (hash) {
        setCurrentRoom(hash);
      } else {
        setCurrentRoom(null);
      }
    };

    checkHash();
    window.addEventListener('hashchange', checkHash);
    return () => window.removeEventListener('hashchange', checkHash);
  }, []);

  const handleJoinRoom = (roomId: string) => {
    window.location.hash = `/${roomId}`;
  };

  const handleLeaveRoom = () => {
    window.location.hash = '/';
  };

  return (
    <div className="font-sans antialiased text-white h-screen w-screen overflow-hidden bg-black">
      {currentRoom ? (
        <Room 
          roomId={currentRoom} 
          onLeave={handleLeaveRoom} 
        />
      ) : (
        <LandingPage onJoin={handleJoinRoom} />
      )}
    </div>
  );
};

export default App;