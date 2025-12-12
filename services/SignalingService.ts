import { SignalMessage } from '../types';
import { supabase } from './supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

// We use Supabase Realtime "Broadcast" mode for signaling.
// This allows us to send ephemeral messages between users without saving them to a database.

type MessageHandler = (message: SignalMessage) => void;

class SignalingService {
  private channel: RealtimeChannel | null = null;
  private listeners: MessageHandler[] = [];
  private roomId: string | null = null;
  private isSubscribed: boolean = false;
  private subscriptionPromise: Promise<void> | null = null;
  public userId: string;

  constructor() {
    this.userId = Math.random().toString(36).substring(7);
  }

  public async connect(roomId: string): Promise<void> {
    // Disconnect any existing channel first
    if (this.channel) {
      console.log('[Signaling] Disconnecting existing channel before reconnecting');
      await this.disconnect();
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    this.roomId = roomId;
    this.isSubscribed = false;

    console.log(`[Signaling] Connecting to room: ${roomId}`);

    // Ensure Realtime connection is established first
    // Broadcast channels don't need tables, but Realtime service must be connected
    console.log('[Signaling] Checking Realtime connection...');
    const isConnected = supabase.realtime.isConnected();
    console.log('[Signaling] Initial connection status:', isConnected);
    
    if (!isConnected) {
      console.log('[Signaling] Realtime not connected, waiting for connection...');
      // Wait up to 5 seconds for Realtime to connect
      let attempts = 0;
      while (!supabase.realtime.isConnected() && attempts < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if (!supabase.realtime.isConnected()) {
        console.error('[Signaling] ❌ Realtime failed to connect after 5 seconds');
        console.error('[Signaling] This usually means:');
        console.error('  1. Realtime is not enabled in Supabase Dashboard → Settings → API');
        console.error('  2. Your Supabase project might be paused');
        console.error('  3. Network/firewall blocking WebSocket connections');
        throw new Error('Realtime service not connected. Check Supabase Realtime settings.');
      }
    }
    
    // Give it a moment to stabilize the connection
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Verify connection is still stable
    if (!supabase.realtime.isConnected()) {
      throw new Error('Realtime connection lost after stabilization period');
    }
    
    console.log('[Signaling] ✅ Realtime connection verified and stable');

    // Create a unique channel for the room
    // Use a simpler channel name format that's more reliable
    const channelName = `room-${roomId}`;
    
    try {
      this.channel = supabase.channel(channelName, {
        config: {
          broadcast: {
            self: false, // Do not receive our own messages
            ack: false, // Don't wait for acknowledgment
          },
        },
      });
      console.log('[Signaling] Channel created:', channelName);
    } catch (err) {
      console.error('[Signaling] Failed to create channel:', err);
      throw new Error('Failed to create channel. Check Supabase Realtime configuration.');
    }

    // IMPORTANT: Set up event listeners BEFORE subscribing
    // Listen for the 'signal' event
    this.channel.on('broadcast', { event: 'signal' }, (payload) => {
      const message = payload.payload as SignalMessage;
      console.log(`[Signaling] Received ${message.type} from ${message.senderId}`);
      this.listeners.forEach((listener) => listener(message));
    });

    // Also listen for system events that might indicate issues
    this.channel.on('system', {}, (payload) => {
      console.log('[Signaling] System event:', payload);
    });

    // Subscribe and wait for subscription
    this.subscriptionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('[Signaling] Subscription timeout after 10 seconds');
        console.error('[Signaling] Channel state:', this.channel?.state);
        console.error('[Signaling] Realtime connected:', supabase.realtime.isConnected());
        reject(new Error('Subscription timeout'));
      }, 10000);

      let subscriptionAttempted = false;
      let hasReceivedStatus = false;

      // Store reference to prevent cleanup issues
      const currentChannel = this.channel;

      if (!currentChannel) {
        reject(new Error('Channel is null'));
        return;
      }

      // Subscribe to the channel
      const subscription = currentChannel.subscribe((status, err) => {
        hasReceivedStatus = true;
        console.log(`[Signaling] Subscription status: ${status}`, err ? `Error: ${JSON.stringify(err)}` : '');
        console.log(`[Signaling] Channel state: ${currentChannel.state}`);
        console.log(`[Signaling] Realtime connected: ${supabase.realtime.isConnected()}`);
        
        if (!subscriptionAttempted) {
          subscriptionAttempted = true;
          console.log('[Signaling] Subscription attempt initiated');
        }

        if (status === 'SUBSCRIBED') {
          clearTimeout(timeout);
          console.log(`[Signaling] ✅ Connected to Supabase channel: ${channelName}`);
          this.isSubscribed = true;
          resolve();
        } else if (status === 'CHANNEL_ERROR') {
            clearTimeout(timeout);
            const errorMsg = err?.message || 'Unknown error';
            console.error(`[Signaling] ❌ Channel error: ${errorMsg}`);
            console.error('[Signaling] Check:');
            console.error('  1. Supabase URL and Anon Key are correct in Vercel environment variables');
            console.error('  2. Realtime is enabled in Supabase Dashboard → Settings → API');
            console.error('  3. Your Supabase project is active (not paused)');
            this.isSubscribed = false;
            reject(new Error(`Channel error: ${errorMsg}`));
          } else if (status === 'TIMED_OUT') {
            clearTimeout(timeout);
            console.error(`[Signaling] ❌ Subscription timed out`);
            console.error('[Signaling] This usually means Realtime is not enabled or network issues');
            this.isSubscribed = false;
            reject(new Error('Subscription timed out. Check if Supabase Realtime is enabled.'));
          } else if (status === 'CLOSED') {
            // Only reject if we haven't successfully subscribed first
            // CLOSED can be called during cleanup, so we need to be careful
            if (!this.isSubscribed && hasReceivedStatus) {
              clearTimeout(timeout);
              console.error(`[Signaling] ❌ Channel closed immediately`);
              console.error('[Signaling] This usually means:');
              console.error('  1. Realtime is not enabled in Supabase project');
              console.error('  2. Check Supabase Dashboard → Database → Replication');
              console.error('  3. Ensure "Enable Realtime" toggle is ON');
              console.error('  4. Your project might be paused (check Supabase dashboard)');
              if (err) {
                console.error('[Signaling] Error details:', err);
              }
              this.isSubscribed = false;
              reject(new Error('Channel closed immediately. Check Supabase Realtime settings in Database → Replication.'));
            } else {
              // CLOSED during cleanup is normal, just log it
              console.log('[Signaling] Channel closed (cleanup)');
            }
          }
        });
    });

    try {
      await this.subscriptionPromise;
    } catch (err) {
      // Clean up on error
      if (this.channel) {
        await supabase.removeChannel(this.channel);
        this.channel = null;
      }
      throw err;
    }
  }

  public async send(message: Omit<SignalMessage, 'roomId' | 'senderId'>) {
    if (!this.channel || !this.roomId) {
      console.warn('[Signaling] Cannot send message, not connected');
      return;
    }

    // Wait for subscription if not yet subscribed
    if (!this.isSubscribed && this.subscriptionPromise) {
      try {
        await this.subscriptionPromise;
      } catch (err) {
        console.error('[Signaling] Cannot send message, subscription failed', err);
        return;
      }
    }

    if (!this.isSubscribed) {
      console.warn('[Signaling] Cannot send message, not subscribed yet');
      return;
    }

    const fullMessage: SignalMessage = {
      ...message,
      roomId: this.roomId,
      senderId: this.userId,
    };

    try {
      const result = await this.channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: fullMessage,
      });

      if (result === 'error') {
        console.error('[Signaling] ❌ Failed to send message:', message.type);
      } else {
        console.log(`[Signaling] ✅ Sent ${message.type} message`);
      }
    } catch (err) {
      console.error('[Signaling] ❌ Error sending message:', err, message);
    }
  }

  public onMessage(handler: MessageHandler) {
    this.listeners.push(handler);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== handler);
    };
  }

  public async disconnect() {
    // Don't disconnect if we're in the middle of subscribing
    if (this.subscriptionPromise && !this.isSubscribed) {
      console.log('[Signaling] Waiting for subscription to complete before disconnecting...');
      try {
        // Wait a short time for subscription, but don't block forever
        await Promise.race([
          this.subscriptionPromise,
          new Promise(resolve => setTimeout(resolve, 1000))
        ]);
      } catch (err) {
        // Ignore errors during cleanup
      }
    }

    if (this.channel) {
      try {
        await supabase.removeChannel(this.channel);
      } catch (err) {
        console.warn('[Signaling] Error removing channel:', err);
      }
      this.channel = null;
    }
    this.listeners = [];
    this.roomId = null;
    this.isSubscribed = false;
    this.subscriptionPromise = null;
    console.log('[Signaling] Disconnected');
  }
}

export const signalingService = new SignalingService();
