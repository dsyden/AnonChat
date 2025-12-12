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
    if (this.channel) {
      await this.disconnect();
    }
    this.roomId = roomId;
    this.isSubscribed = false;

    console.log(`[Signaling] Connecting to room: ${roomId}`);

    // Create a unique channel for the room
    // Use a simpler channel name format that's more reliable
    const channelName = `room-${roomId}`;
    this.channel = supabase.channel(channelName, {
      config: {
        broadcast: {
          self: false, // Do not receive our own messages
          ack: false, // Don't wait for acknowledgment
        },
      },
    });

    // Listen for the 'signal' event
    this.channel.on('broadcast', { event: 'signal' }, (payload) => {
      const message = payload.payload as SignalMessage;
      console.log(`[Signaling] Received ${message.type} from ${message.senderId}`);
      this.listeners.forEach((listener) => listener(message));
    });

    // Subscribe and wait for subscription
    this.subscriptionPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('[Signaling] Subscription timeout after 10 seconds');
        console.error('[Signaling] Channel state:', this.channel?.state);
        reject(new Error('Subscription timeout'));
      }, 10000);

      let subscriptionAttempted = false;

      this.channel!
        .subscribe((status, err) => {
          console.log(`[Signaling] Subscription status: ${status}`, err ? `Error: ${err}` : '');
          
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
            clearTimeout(timeout);
            console.error(`[Signaling] ❌ Channel closed immediately`);
            console.error('[Signaling] Common causes:');
            console.error('  1. Invalid Supabase credentials (check Vercel env vars)');
            console.error('  2. Realtime not enabled in Supabase project');
            console.error('  3. Supabase project is paused or deleted');
            console.error('  4. Network/firewall blocking WebSocket connection');
            if (err) {
              console.error('[Signaling] Error details:', err);
            }
            this.isSubscribed = false;
            reject(new Error('Channel closed. Verify Supabase credentials and Realtime settings.'));
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
    if (this.channel) {
      await supabase.removeChannel(this.channel);
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
