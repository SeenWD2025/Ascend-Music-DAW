/**
 * FileImportDialog Component
 * Dialog for importing audio files from Google Drive
 * 
 * Features:
 * - Lists user's audio files from Drive
 * - Search and filter functionality
 * - Audio preview playback
 * - Import to selected track
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Search,
  X,
  Play,
  Pause,
  FileAudio,
  Loader2,
  RefreshCw,
  Download,
  AlertCircle,
} from 'lucide-react';
import * as Sentry from '@sentry/browser';
import { cn } from '../../lib/utils';
import { fetchAudioBuffer } from '../../lib/drive';
import { useProjectStore } from '../../stores';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  createdTime: string;
  modifiedTime: string;
  thumbnailLink?: string;
}

export interface FileImportDialogProps {
  /** Whether the dialog is open */
  isOpen: boolean;
  /** Callback to close the dialog */
  onClose: () => void;
  /** Target track ID for import */
  targetTrackId: string;
  /** Start time for clip placement */
  startTime?: number;
  /** Callback when import completes */
  onImport?: (file: DriveFile, trackId: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = '/api/v1';

async function fetchDriveFiles(query?: string): Promise<DriveFile[]> {
  const params = new URLSearchParams();
  if (query) {
    params.set('q', query);
  }
  params.set('mimeType', 'audio');

  const response = await fetch(`${API_BASE}/drive/files?${params.toString()}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Failed to fetch files');
  }

  const data = await response.json();
  return data.files || [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Dialog for browsing and importing audio files from Google Drive
 * 
 * @example
 * ```tsx
 * function TrackHeader({ track }) {
 *   const [showImport, setShowImport] = useState(false);
 *   
 *   return (
 *     <>
 *       <button onClick={() => setShowImport(true)}>Import from Drive</button>
 *       <FileImportDialog
 *         isOpen={showImport}
 *         onClose={() => setShowImport(false)}
 *         targetTrackId={track.id}
 *         onImport={(file) => console.log('Imported:', file)}
 *       />
 *     </>
 *   );
 * }
 * ```
 */
export function FileImportDialog({
  isOpen,
  onClose,
  targetTrackId,
  startTime = 0,
  onImport,
}: FileImportDialogProps) {
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<DriveFile | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  
  const { addClip } = useProjectStore();

  // ─────────────────────────────────────────────────────────────────────────
  // Data Fetching
  // ─────────────────────────────────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const driveFiles = await fetchDriveFiles(searchQuery);
      setFiles(driveFiles);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load files';
      setError(message);
      
      Sentry.captureException(err, {
        tags: { component: 'FileImportDialog', operation: 'loadFiles' },
      });
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (isOpen) {
      loadFiles();
    }
    
    return () => {
      // Stop any preview audio
      stopPreview();
    };
  }, [isOpen, loadFiles]);

  // Debounced search
  useEffect(() => {
    if (!isOpen) return;
    
    const timer = setTimeout(() => {
      loadFiles();
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, isOpen, loadFiles]);

  // ─────────────────────────────────────────────────────────────────────────
  // Preview Playback
  // ─────────────────────────────────────────────────────────────────────────

  const startPreview = async (file: DriveFile) => {
    // Stop any existing preview
    stopPreview();

    setPreviewingId(file.id);

    try {
      // Initialize audio context if needed
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }

      const audioContext = audioContextRef.current;
      
      // Resume if suspended
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      // Fetch and decode audio
      const buffer = await fetchAudioBuffer(file.id);

      // Check if still previewing this file
      if (previewingId !== file.id) return;

      // Create and play source node
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);
      
      sourceNodeRef.current = source;

      // Stop after buffer duration
      source.onended = () => {
        setPreviewingId(null);
        sourceNodeRef.current = null;
      };
    } catch (err) {
      setPreviewingId(null);
      console.error('[FileImportDialog] Preview failed:', err);
    }
  };

  const stopPreview = () => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
      } catch {
        // Ignore errors from already stopped sources
      }
      sourceNodeRef.current = null;
    }
    setPreviewingId(null);
  };

  const togglePreview = (file: DriveFile) => {
    if (previewingId === file.id) {
      stopPreview();
    } else {
      startPreview(file);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Import
  // ─────────────────────────────────────────────────────────────────────────

  const handleImport = async () => {
    if (!selectedFile) return;

    setIsImporting(true);

    try {
      // Fetch the audio to get duration
      const buffer = await fetchAudioBuffer(selectedFile.id);
      
      // Create clip on track
      addClip(targetTrackId, {
        id: crypto.randomUUID(),
        name: selectedFile.name,
        startTime,
        duration: buffer.duration,
        sourceUrl: selectedFile.id,
        color: '#3b82f6',
      });

      // Track PostHog event
      // posthog.capture('daw_file_imported', {
      //   file_id: selectedFile.id,
      //   file_name: selectedFile.name,
      //   file_size: selectedFile.size,
      //   track_id: targetTrackId,
      // });

      onImport?.(selectedFile, targetTrackId);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      setError(message);

      Sentry.captureException(err, {
        tags: { component: 'FileImportDialog', operation: 'import' },
        contexts: { file: { id: selectedFile.id, name: selectedFile.name } },
      });
    } finally {
      setIsImporting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopPreview();
      audioContextRef.current?.close();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        className={cn(
          'relative w-full max-w-2xl max-h-[80vh]',
          'bg-daw-bg-secondary rounded-lg shadow-xl',
          'border border-daw-border-primary',
          'flex flex-col',
          'animate-in zoom-in-95 duration-200'
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-daw-border-primary">
          <h2 className="text-lg font-semibold text-daw-text-primary">
            Import from Google Drive
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-daw-text-muted hover:text-daw-text-primary rounded transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-4 border-b border-daw-border-primary">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-daw-text-muted" />
            <input
              type="text"
              placeholder="Search audio files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                'w-full pl-10 pr-4 py-2 rounded-md',
                'bg-daw-bg-tertiary border border-daw-border-primary',
                'text-daw-text-primary placeholder:text-daw-text-muted',
                'focus:outline-none focus:ring-2 focus:ring-daw-accent-primary'
              )}
            />
            <button
              onClick={() => loadFiles()}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-daw-text-muted hover:text-daw-text-primary"
              title="Refresh"
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </button>
          </div>
        </div>

        {/* File List */}
        <div className="flex-1 overflow-y-auto min-h-[300px]">
          {isLoading && files.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 text-daw-accent-primary animate-spin" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-red-500">
              <AlertCircle className="h-8 w-8" />
              <p>{error}</p>
              <button
                onClick={loadFiles}
                className="px-4 py-2 mt-2 text-sm bg-daw-bg-tertiary rounded hover:bg-daw-bg-primary"
              >
                Retry
              </button>
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-daw-text-muted">
              <FileAudio className="h-12 w-12" />
              <p>No audio files found</p>
            </div>
          ) : (
            <div className="divide-y divide-daw-border-primary">
              {files.map((file) => (
                <FileListItem
                  key={file.id}
                  file={file}
                  isSelected={selectedFile?.id === file.id}
                  isPreviewing={previewingId === file.id}
                  onSelect={() => setSelectedFile(file)}
                  onTogglePreview={() => togglePreview(file)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-daw-border-primary">
          <button
            onClick={onClose}
            className={cn(
              'px-4 py-2 rounded-md',
              'text-daw-text-primary',
              'hover:bg-daw-bg-tertiary',
              'transition-colors'
            )}
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedFile || isImporting}
            className={cn(
              'px-4 py-2 rounded-md',
              'bg-daw-accent-primary text-white',
              'hover:bg-daw-accent-primary/90',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              'flex items-center gap-2',
              'transition-colors'
            )}
          >
            {isImporting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                Import
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// File List Item Component
// ─────────────────────────────────────────────────────────────────────────────

interface FileListItemProps {
  file: DriveFile;
  isSelected: boolean;
  isPreviewing: boolean;
  onSelect: () => void;
  onTogglePreview: () => void;
}

function FileListItem({
  file,
  isSelected,
  isPreviewing,
  onSelect,
  onTogglePreview,
}: FileListItemProps) {
  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-4 px-6 py-3 cursor-pointer',
        'transition-colors',
        isSelected
          ? 'bg-daw-accent-primary/20'
          : 'hover:bg-daw-bg-tertiary'
      )}
    >
      {/* Preview Button */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onTogglePreview();
        }}
        className={cn(
          'p-2 rounded-full',
          'bg-daw-bg-tertiary hover:bg-daw-accent-primary',
          'transition-colors'
        )}
        title={isPreviewing ? 'Stop preview' : 'Preview'}
      >
        {isPreviewing ? (
          <Pause className="h-4 w-4 text-white" />
        ) : (
          <Play className="h-4 w-4 text-daw-text-primary" />
        )}
      </button>

      {/* File Icon */}
      <FileAudio className="h-8 w-8 text-daw-accent-primary flex-shrink-0" />

      {/* File Info */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-daw-text-primary truncate">
          {file.name}
        </p>
        <p className="text-xs text-daw-text-muted">
          {formatSize(file.size)} • {formatDate(file.modifiedTime)}
        </p>
      </div>

      {/* Selection Indicator */}
      {isSelected && (
        <div className="w-2 h-2 rounded-full bg-daw-accent-primary" />
      )}
    </div>
  );
}

export default FileImportDialog;
