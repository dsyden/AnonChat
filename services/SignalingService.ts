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

    // Create a unique channel for the room
    this.channel = supabase.channel(`room:${roomId}`, {
      config: {
        broadcast: {
          self: false, // Do not receive our own messages
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
      this.channel!
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log(`[Signaling] Connected to Supabase channel: room:${roomId}`);
            this.isSubscribed = true;
            resolve();
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            console.error(`[Signaling] Failed to subscribe: ${status}`);
            this.isSubscribed = false;
            reject(new Error(`Failed to subscribe: ${status}`));
          }
        });
    });

    await this.subscriptionPromise;
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

    const result = await this.channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: fullMessage,
    });

    if (result === 'error') {
      console.error('[Signaling] Failed to send message');
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
