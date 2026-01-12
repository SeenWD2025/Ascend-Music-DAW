/**
 * DAW Collaboration Store
 * Zustand store for managing realtime collaboration state.
 */

import { create } from 'zustand';
import * as Sentry from '@sentry/browser';
import {
  realtimeClient,
  type UserPresence,
  type Lock,
  type ConnectionState,
  type DAWEvent,
} from '../lib/realtime';

// ============================================================================
// Types
// ============================================================================

export interface CollaborationState {
  /** Whether connected to realtime server */
  isConnected: boolean;
  
  /** Whether currently connecting */
  isConnecting: boolean;
  
  /** Connection error message */
  connectionError?: string;
  
  /** Current reconnect attempt number */
  reconnectAttempt: number;
  
  /** List of collaborators in the session */
  collaborators: UserPresence[];
  
  /** Active locks in the project */
  locks: Lock[];
  
  /** This client's ID */
  myClientId: string;
  
  /** Currently held locks by this client */
  myLocks: Set<string>;
  
  // Actions
  connect: (projectId: string, token: string) => Promise<void>;
  disconnect: () => void;
  updateCursor: (position: number) => void;
  updatePlayhead: (position: number) => void;
  selectClips: (clipIds: string[]) => void;
  selectTrack: (trackId: string | null) => void;
  updateActivity: (activity: 'idle' | 'editing' | 'playing' | 'recording' | 'dragging') => void;
  acquireLock: (type: 'clip' | 'track' | 'plugin' | 'selection', id: string) => Promise<boolean>;
  releaseLock: (type: 'clip' | 'track' | 'plugin' | 'selection', id: string) => void;
  isLockedByOther: (type: 'clip' | 'track' | 'plugin' | 'selection', id: string) => Lock | null;
  getLockHolder: (type: 'clip' | 'track' | 'plugin' | 'selection', id: string) => UserPresence | null;
}

// ============================================================================
// Store
// ============================================================================

export const useCollaborationStore = create<CollaborationState>((set, get) => {
  // Set up event handlers once
  let handlersInitialized = false;
  
  const initializeHandlers = () => {
    if (handlersInitialized) return;
    handlersInitialized = true;
    
    // Handle presence updates
    realtimeClient.onPresenceUpdate((users) => {
      set({ collaborators: users });
    });
    
    // Handle lock changes
    realtimeClient.onLockChange((locks) => {
      set({ locks });
    });
    
    // Handle connection state changes
    realtimeClient.onConnectionChange((state: ConnectionState) => {
      set({
        isConnected: state.isConnected,
        isConnecting: state.isConnecting,
        connectionError: state.error,
        reconnectAttempt: state.reconnectAttempt,
      });
    });
    
    // Handle incoming events (for syncing with project store)
    realtimeClient.onEvent((event: DAWEvent) => {
      // Events are handled by specific listeners in project.store.ts
      // This is just for logging/debugging
      console.log('[CollaborationStore] Received event:', event.type);
    });
  };

  return {
    // Initial state
    isConnected: false,
    isConnecting: false,
    connectionError: undefined,
    reconnectAttempt: 0,
    collaborators: [],
    locks: [],
    myClientId: '',
    myLocks: new Set(),

    // Connect to a project
    connect: async (projectId: string, token: string): Promise<void> => {
      initializeHandlers();
      
      try {
        await realtimeClient.connect(projectId, token);
        
        set({
          myClientId: realtimeClient.getClientId(),
          isConnected: true,
          isConnecting: false,
          connectionError: undefined,
        });
      } catch (err) {
        const error = err instanceof Error ? err.message : 'Connection failed';
        
        Sentry.captureException(err, {
          tags: { component: 'collaboration_store' },
          extra: { projectId },
        });
        
        set({
          isConnected: false,
          isConnecting: false,
          connectionError: error,
        });
        
        throw err;
      }
    },

    // Disconnect from project
    disconnect: () => {
      realtimeClient.disconnect();
      
      set({
        isConnected: false,
        isConnecting: false,
        collaborators: [],
        locks: [],
        myLocks: new Set(),
      });
    },

    // Update cursor position
    updateCursor: (position: number) => {
      realtimeClient.updateCursor(position);
    },

    // Update playhead position
    updatePlayhead: (position: number) => {
      realtimeClient.updatePlayhead(position);
    },

    // Update selected clips
    selectClips: (clipIds: string[]) => {
      realtimeClient.selectClips(clipIds);
    },

    // Update selected track
    selectTrack: (trackId: string | null) => {
      realtimeClient.selectTrack(trackId);
    },

    // Update activity state
    updateActivity: (activity) => {
      realtimeClient.updateActivity(activity);
    },

    // Acquire a lock
    acquireLock: async (type, id): Promise<boolean> => {
      const state = get();
      
      // Check if already locked by another user
      const existingLock = state.locks.find(
        (lock) =>
          lock.resourceType === type &&
          lock.resourceId === id &&
          lock.holderClientId !== state.myClientId
      );
      
      if (existingLock) {
        return false;
      }
      
      // Check if we already hold this lock
      const lockKey = `${type}:${id}`;
      if (state.myLocks.has(lockKey)) {
        return true;
      }
      
      // Request the lock
      return new Promise((resolve) => {
        // Set up one-time listener for lock response
        const cleanup = realtimeClient.onLockChange((locks) => {
          const ourLock = locks.find(
            (lock) =>
              lock.resourceType === type &&
              lock.resourceId === id &&
              lock.holderClientId === state.myClientId
          );
          
          if (ourLock) {
            set((s) => ({
              myLocks: new Set([...s.myLocks, lockKey]),
            }));
            cleanup();
            resolve(true);
          }
        });
        
        // Request the lock
        realtimeClient.acquireLock(type, id, 'editing');
        
        // Timeout after 2 seconds
        setTimeout(() => {
          cleanup();
          resolve(false);
        }, 2000);
      });
    },

    // Release a lock
    releaseLock: (type, id) => {
      const lockKey = `${type}:${id}`;
      
      set((state) => {
        const newLocks = new Set(state.myLocks);
        newLocks.delete(lockKey);
        return { myLocks: newLocks };
      });
      
      realtimeClient.releaseLock(type, id);
    },

    // Check if resource is locked by another user
    isLockedByOther: (type, id): Lock | null => {
      const state = get();
      
      const lock = state.locks.find(
        (lock) =>
          lock.resourceType === type &&
          lock.resourceId === id &&
          lock.holderClientId !== state.myClientId
      );
      
      return lock ?? null;
    },

    // Get the user who holds a lock
    getLockHolder: (type, id): UserPresence | null => {
      const state = get();
      
      const lock = state.locks.find(
        (lock) => lock.resourceType === type && lock.resourceId === id
      );
      
      if (!lock) return null;
      
      return (
        state.collaborators.find(
          (user) => user.clientId === lock.holderClientId
        ) ?? null
      );
    },
  };
});

export default useCollaborationStore;
