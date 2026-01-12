/**
 * DAW Realtime Module
 * Exports realtime client and types for collaboration.
 */

export {
  RealtimeClient,
  realtimeClient,
  type UserPresence,
  type Lock,
  type DAWEvent,
  type ConnectionState,
  type WebSocketMessage,
} from './client';

export {
  PluginSyncClient,
  pluginSyncClient,
  type PluginParamChange,
  type PluginParamBatch,
  type PluginLockState,
  type PluginEvent,
} from './plugin-sync';
