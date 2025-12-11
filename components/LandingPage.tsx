import React, { useState } from 'react';
import { generateRoomName } from '../utils/randomName';
import { isSupabaseConfigured } from '../services/supabaseClient';

interface LandingPageProps {
  onJoin: (roomId: string) => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onJoin }) => {
  const [inputRoom, setInputRoom] = useState('');

  const handleCreate = () => {
    const newRoom = generateRoomName();
    onJoin(newRoom);
  };

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputRoom.trim()) {
      onJoin(inputRoom.trim().toLowerCase());
    }
  };

  // If Supabase is not configured, show a setup guide instead of the app
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 text-center">
        <div className="max-w-md w-full bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
          <div className="w-16 h-16 bg-orange-500/10 rounded-2xl mx-auto mb-6 flex items-center justify-center text-orange-500">
             <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>
          <h1 className="text-2xl font-bold text-white mb-4">Supabase Setup Required</h1>
          <p className="text-gray-400 mb-6 text-sm">
            To enable global signaling, you need to connect your Supabase project.
          </p>
          <div className="bg-black/50 rounded-lg p-4 text-left text-xs text-gray-300 font-mono mb-6 overflow-x-auto">
             1. Go to supabase.com and create a project<br/>
             2. Copy URL & Anon Key from Settings - API<br/>
             3. Update <strong>services/supabaseClient.ts</strong>
          </div>
          <div className="text-xs text-gray-500">
            Edit the code to continue.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 relative overflow-hidden">
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl translate-x-1/2 translate-y-1/2"></div>

        <div className="z-10 max-w-md w-full bg-gray-900/50 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl">
            <div className="text-center mb-10">
                <div className="w-16 h-16 bg-gradient-to-tr from-blue-500 to-purple-600 rounded-2xl mx-auto mb-6 flex items-center justify-center shadow-lg shadow-purple-500/20">
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white"><path d="M15.91 11.672a.375.375 0 0 1 0 .656l-5.603 3.113a.375.375 0 0 1-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112Z"/><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
                </div>
                <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 mb-2">FaceTime P2P</h1>
                <p className="text-gray-400 text-sm">Secure, global, direct peer-to-peer video chat.</p>
            </div>

            <div className="space-y-6">
                <button 
                    onClick={handleCreate}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2 group"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
                    Create New Room
                </button>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <div className="w-full border-t border-gray-800"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                        <span className="px-2 bg-gray-900/50 text-gray-500">or join existing</span>
                    </div>
                </div>

                <form onSubmit={handleJoin} className="flex gap-2">
                    <input
                        type="text"
                        value={inputRoom}
                        onChange={(e) => setInputRoom(e.target.value)}
                        placeholder="Enter room name..."
                        className="flex-1 bg-gray-950/50 border border-gray-800 text-white placeholder-gray-600 rounded-xl px-4 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500/50 transition-all"
                    />
                    <button 
                        type="submit"
                        disabled={!inputRoom.trim()}
                        className="px-6 py-3 bg-gray-800 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl transition-colors border border-gray-700"
                    >
                        Join
                    </button>
                </form>
            </div>
            
            <div className="mt-8 flex justify-center gap-4 text-xs text-gray-600">
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    Supabase Connected
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Global P2P Active
                </span>
            </div>
        </div>
    </div>
  );
};

export default LandingPage;