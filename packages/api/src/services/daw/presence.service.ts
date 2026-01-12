/**
 * DAW Presence Service
 * Manages user presence and cursor positions for realtime collaboration.
 */

import * as Sentry from '@sentry/node';
import { connectionRegistry } from './realtime.service.js';

// ============================================================================
// Types
// ============================================================================

export interface UserPresence {
  /** User ID from Supabase auth */
  userId: string;
  
  /** Client instance ID (per browser tab) */
  clientId: string;
  
  /** Display name for UI */
  displayName: string;
  
  /** Avatar URL */
  avatarUrl?: string;
  
  /** Assigned collaboration color (hex) */
  color: string;
  
  /** Cursor position on timeline in seconds */
  cursorPosition?: number;
  
  /** Playhead position in seconds */
  playheadPosition?: number;
  
  /** Currently selected track ID */
  selectedTrackId?: string;
  
  /** Currently selected clip IDs */
  selectedClipIds?: string[];
  
  /** User's current activity */
  activity?: 'idle' | 'editing' | 'playing' | 'recording' | 'dragging';
  
  /** Last seen timestamp */
  lastSeen: Date;
  
  /** When user joined this session */
  joinedAt: Date;
}

export interface PresenceUpdatePayload {
  cursorPosition?: number;
  playheadPosition?: number;
  selectedTrackId?: string;
  selectedClipIds?: string[];
  activity?: 'idle' | 'editing' | 'playing' | 'recording' | 'dragging';
}

export interface PresenceBroadcast {
  type: 'presence';
  action: 'sync' | 'join' | 'leave' | 'update';
  data: {
    users: UserPresence[];
    updatedUser?: UserPresence;
  };
}

// ============================================================================
// Collaboration Colors
// ============================================================================

const COLLABORATION_COLORS = [
  '#EF4444', // red
  '#F97316', // orange
  '#EAB308', // yellow
  '#22C55E', // green
  '#14B8A6', // teal
  '#3B82F6', // blue
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#F472B6', // rose
  '#A855F7', // purple
];

// ============================================================================
// Presence Service
// ============================================================================

class PresenceService {
  /** Map of project ID -> Map of client ID -> UserPresence */
  private presenceByProject: Map<string, Map<string, UserPresence>> = new Map();
  
  /** Map of client ID -> project ID (for quick lookups) */
  private clientToProject: Map<string, string> = new Map();
  
  /** Color assignments per project to avoid duplicates */
  private colorAssignments: Map<string, Map<string, string>> = new Map();
  
  /** Stale presence timeout (30 seconds without update) */
  private readonly STALE_TIMEOUT_MS = 30_000;

  /**
   * Assigns a collaboration color to a user in a project.
   */
  private assignColor(projectId: string, userId: string): string {
    let projectColors = this.colorAssignments.get(projectId);
    if (!projectColors) {
      projectColors = new Map();
      this.colorAssignments.set(projectId, projectColors);
    }
    
    // Check if user already has a color
    const existingColor = projectColors.get(userId);
    if (existingColor) return existingColor;
    
    // Find first unused color
    const usedColors = new Set(projectColors.values());
    const availableColor = COLLABORATION_COLORS.find(c => !usedColors.has(c))
      ?? COLLABORATION_COLORS[projectColors.size % COLLABORATION_COLORS.length];
    
    projectColors.set(userId, availableColor);
    return availableColor;
  }

  /**
   * User joins a project session.
   */
  join(
    projectId: string,
    presence: Omit<UserPresence, 'color' | 'lastSeen' | 'joinedAt'>
  ): UserPresence {
    let projectPresence = this.presenceByProject.get(projectId);
    if (!projectPresence) {
      projectPresence = new Map();
      this.presenceByProject.set(projectId, projectPresence);
    }
    
    const now = new Date();
    const color = this.assignColor(projectId, presence.userId);
    
    const fullPresence: UserPresence = {
      ...presence,
      color,
      lastSeen: now,
      joinedAt: now,
      activity: 'idle',
    };
    
    projectPresence.set(presence.clientId, fullPresence);
    this.clientToProject.set(presence.clientId, projectId);
    
    console.log(
      `[PresenceService] User ${presence.displayName} (${presence.clientId}) joined project ${projectId}`
    );
    
    // Broadcast join to all other clients
    this.broadcast(projectId, 'join', fullPresence, presence.clientId);
    
    return fullPresence;
  }

  /**
   * User leaves a project session.
   */
  leave(projectId: string, clientId: string, reason: 'explicit' | 'timeout' | 'disconnect' = 'explicit'): void {
    const projectPresence = this.presenceByProject.get(projectId);
    if (!projectPresence) return;
    
    const presence = projectPresence.get(clientId);
    if (!presence) return;
    
    projectPresence.delete(clientId);
    this.clientToProject.delete(clientId);
    
    console.log(
      `[PresenceService] User ${presence.displayName} (${clientId}) left project ${projectId} (${reason})`
    );
    
    // Clean up empty project
    if (projectPresence.size === 0) {
      this.presenceByProject.delete(projectId);
      this.colorAssignments.delete(projectId);
    }
    
    // Broadcast leave to remaining clients
    this.broadcast(projectId, 'leave', presence);
  }

  /**
   * Updates a user's presence state.
   */
  update(projectId: string, clientId: string, updates: PresenceUpdatePayload): UserPresence | null {
    const projectPresence = this.presenceByProject.get(projectId);
    if (!projectPresence) return null;
    
    const presence = projectPresence.get(clientId);
    if (!presence) return null;
    
    // Apply updates
    const updatedPresence: UserPresence = {
      ...presence,
      ...updates,
      lastSeen: new Date(),
    };
    
    projectPresence.set(clientId, updatedPresence);
    
    // Broadcast update to other clients
    this.broadcast(projectId, 'update', updatedPresence, clientId);
    
    return updatedPresence;
  }

  /**
   * Gets all presence states for a project.
   */
  getAll(projectId: string): UserPresence[] {
    const projectPresence = this.presenceByProject.get(projectId);
    if (!projectPresence) return [];
    
    return Array.from(projectPresence.values());
  }

  /**
   * Gets a specific user's presence.
   */
  get(projectId: string, clientId: string): UserPresence | null {
    const projectPresence = this.presenceByProject.get(projectId);
    if (!projectPresence) return null;
    
    return projectPresence.get(clientId) ?? null;
  }

  /**
   * Gets the project ID for a client.
   */
  getProjectForClient(clientId: string): string | undefined {
    return this.clientToProject.get(clientId);
  }

  /**
   * Gets count of users in a project.
   */
  getCount(projectId: string): number {
    const projectPresence = this.presenceByProject.get(projectId);
    return projectPresence?.size ?? 0;
  }

  /**
   * Broadcasts presence updates to all clients in a project.
   */
  broadcast(
    projectId: string,
    action: 'sync' | 'join' | 'leave' | 'update',
    updatedUser?: UserPresence,
    excludeClientId?: string
  ): void {
    const clients = connectionRegistry.getProjectClients(projectId);
    if (clients.length === 0) return;
    
    const allUsers = this.getAll(projectId);
    
    const message: PresenceBroadcast = {
      type: 'presence',
      action,
      data: {
        users: allUsers,
        updatedUser,
      },
    };
    
    const messageStr = JSON.stringify(message);
    let sent = 0;
    let failed = 0;
    
    for (const client of clients) {
      // Skip the client that triggered the update
      if (excludeClientId && client.clientId === excludeClientId) continue;
      
      try {
        if (client.socket.readyState === 1) { // WebSocket.OPEN
          client.socket.send(messageStr);
          sent++;
        } else {
          failed++;
        }
      } catch (err) {
        Sentry.captureException(err, {
          tags: { operation: 'presence_broadcast' },
          extra: { projectId, clientId: client.clientId },
        });
        failed++;
      }
    }
    
    console.log(
      `[PresenceService] Broadcast ${action} to project ${projectId}: sent=${sent}, failed=${failed}`
    );
  }

  /**
   * Cleans up stale presence entries.
   */
  cleanupStale(): number {
    let cleaned = 0;
    const now = Date.now();
    
    for (const [projectId, projectPresence] of this.presenceByProject.entries()) {
      for (const [clientId, presence] of projectPresence.entries()) {
        const idleTime = now - presence.lastSeen.getTime();
        if (idleTime > this.STALE_TIMEOUT_MS) {
          this.leave(projectId, clientId, 'timeout');
          cleaned++;
        }
      }
    }
    
    if (cleaned > 0) {
      console.log(`[PresenceService] Cleaned up ${cleaned} stale presence entries`);
    }
    
    return cleaned;
  }

  /**
   * Gets service statistics.
   */
  getStats(): {
    totalUsers: number;
    activeProjects: number;
    projectStats: Array<{ projectId: string; userCount: number }>;
  } {
    const projectStats: Array<{ projectId: string; userCount: number }> = [];
    let totalUsers = 0;
    
    for (const [projectId, projectPresence] of this.presenceByProject.entries()) {
      const userCount = projectPresence.size;
      projectStats.push({ projectId, userCount });
      totalUsers += userCount;
    }
    
    return {
      totalUsers,
      activeProjects: this.presenceByProject.size,
      projectStats,
    };
  }
}

// Singleton instance
export const presenceService = new PresenceService();

export default presenceService;
