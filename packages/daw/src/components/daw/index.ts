/**
 * DAW UI Components
 * Core components for the Digital Audio Workstation interface
 */

export { TransportBar } from './TransportBar';
export { Timeline } from './Timeline';
export { DAWShell } from './DAWShell';
export { AudioContextOverlay } from './AudioContextOverlay';
export { MobileBlocker } from './MobileBlocker';

// Track and clip components
export { Track } from './Track';
export { TrackHeader } from './TrackHeader';
export { Clip } from './Clip';
export { WaveformDisplay } from './WaveformDisplay';

// Mixer
export { Mixer } from './Mixer';

// Drive integration
export { UploadDropzone, type UploadDropzoneProps } from './UploadDropzone';
export { FileImportDialog, type FileImportDialogProps, type DriveFile } from './FileImportDialog';

// Collaboration
export { CollaboratorCursors } from './CollaboratorCursors';
export { CollaboratorAvatars } from './CollaboratorAvatars';

// Plugin system
export { PluginBrowser, type PluginBrowserProps } from './PluginBrowser';
export { PluginSlot, type PluginSlotProps } from './PluginSlot';
export { PluginParameters, type PluginParametersProps } from './PluginParameters';
export { EffectsChain, type EffectsChainProps } from './EffectsChain';
export { PluginLoadError, PluginErrorBoundary, type PluginLoadErrorProps } from './PluginLoadError';
