/**
 * UploadDropzone Component
 * Full-screen drag-and-drop overlay for audio file uploads
 * 
 * Features:
 * - Shows overlay when dragging files over DAW
 * - Validates audio file types
 * - Displays upload progress
 * - Creates clip on track after upload
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import * as Sentry from '@sentry/browser';
import { cn } from '../../lib/utils';
import { 
  uploadFile, 
  validateFile,
  type UploadProgress, 
  type UploadResult 
} from '../../lib/drive';
import { useProjectStore } from '../../stores';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface UploadDropzoneProps {
  /** Target track ID for clip creation (optional - uses first track if not specified) */
  targetTrackId?: string;
  /** Start time for clip placement in seconds */
  startTime?: number;
  /** Callback when upload completes */
  onUploadComplete?: (result: UploadResult, trackId: string) => void;
  /** Callback when upload fails */
  onUploadError?: (error: Error, file: File) => void;
  /** Whether the dropzone is disabled */
  disabled?: boolean;
}

interface UploadState {
  file: File;
  progress: number;
  status: 'uploading' | 'success' | 'error';
  error?: string;
  result?: UploadResult;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Drag-and-drop upload overlay for the DAW
 * 
 * @example
 * ```tsx
 * function DAWLayout() {
 *   return (
 *     <div className="relative h-screen">
 *       <Timeline />
 *       <UploadDropzone 
 *         onUploadComplete={(result) => console.log('Uploaded:', result)}
 *       />
 *     </div>
 *   );
 * }
 * ```
 */
export function UploadDropzone({
  targetTrackId,
  startTime = 0,
  onUploadComplete,
  onUploadError,
  disabled = false,
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploads, setUploads] = useState<Map<string, UploadState>>(new Map());
  
  const dragCounterRef = useRef(0);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  
  const { currentProject, tracks, addClip } = useProjectStore();

  // Accept extensions for drag hint
  const acceptedExtensions = '.wav, .mp3, .flac, .ogg, .aiff';

  // ─────────────────────────────────────────────────────────────────────────
  // Drag Event Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (disabled) return;
    
    dragCounterRef.current++;
    
    // Check if dragging files
    if (e.dataTransfer?.types.includes('Files')) {
      setIsDragging(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragCounterRef.current--;
    
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = disabled ? 'none' : 'copy';
    }
  }, [disabled]);

  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    dragCounterRef.current = 0;
    setIsDragging(false);
    
    if (disabled || !e.dataTransfer?.files.length) return;

    const files = Array.from(e.dataTransfer.files);
    
    // Filter and validate audio files
    const audioFiles = files.filter((file) => {
      const validation = validateFile(file);
      if (!validation.valid) {
        console.warn(`[UploadDropzone] Skipping invalid file: ${file.name} - ${validation.error}`);
        return false;
      }
      return true;
    });

    if (audioFiles.length === 0) {
      return;
    }

    // Upload each file
    for (const file of audioFiles) {
      await uploadFileWithProgress(file);
    }
  }, [disabled]);

  // ─────────────────────────────────────────────────────────────────────────
  // Upload Logic
  // ─────────────────────────────────────────────────────────────────────────

  const uploadFileWithProgress = async (file: File) => {
    if (!currentProject) {
      console.error('[UploadDropzone] No project loaded');
      return;
    }

    const uploadId = crypto.randomUUID();
    
    // Add to uploads state
    setUploads((prev) => {
      const next = new Map(prev);
      next.set(uploadId, {
        file,
        progress: 0,
        status: 'uploading',
      });
      return next;
    });

    try {
      const result = await uploadFile(
        file,
        currentProject.id,
        (progress: UploadProgress) => {
          setUploads((prev) => {
            const next = new Map(prev);
            const state = next.get(uploadId);
            if (state) {
              next.set(uploadId, { ...state, progress: progress.percent });
            }
            return next;
          });
        }
      );

      // Mark as success
      setUploads((prev) => {
        const next = new Map(prev);
        const state = next.get(uploadId);
        if (state) {
          next.set(uploadId, { ...state, status: 'success', progress: 100, result });
        }
        return next;
      });

      // Create clip on track
      const trackId = targetTrackId || tracks[0]?.id;
      if (trackId) {
        addClip(trackId, {
          id: crypto.randomUUID(),
          name: file.name,
          startTime,
          duration: 10, // TODO: Get actual duration from audio metadata
          sourceUrl: result.driveFileId,
          color: '#3b82f6',
        });
      }

      // Track PostHog event
      // posthog.capture('daw_file_uploaded', {
      //   project_id: currentProject.id,
      //   file_size: file.size,
      //   file_type: file.type,
      //   track_id: trackId,
      // });

      onUploadComplete?.(result, trackId);

      // Remove from list after delay
      setTimeout(() => {
        setUploads((prev) => {
          const next = new Map(prev);
          next.delete(uploadId);
          return next;
        });
      }, 3000);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Upload failed');
      
      // Mark as error
      setUploads((prev) => {
        const next = new Map(prev);
        const state = next.get(uploadId);
        if (state) {
          next.set(uploadId, { ...state, status: 'error', error: err.message });
        }
        return next;
      });

      Sentry.captureException(error, {
        tags: { component: 'UploadDropzone' },
        contexts: { file: { name: file.name, size: file.size, type: file.type } },
      });

      onUploadError?.(err, file);

      // Remove from list after delay
      setTimeout(() => {
        setUploads((prev) => {
          const next = new Map(prev);
          next.delete(uploadId);
          return next;
        });
      }, 5000);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Event Listener Setup
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handleWindowDragEnter = (e: DragEvent) => handleDragEnter(e);
    const handleWindowDragLeave = (e: DragEvent) => handleDragLeave(e);
    const handleWindowDragOver = (e: DragEvent) => handleDragOver(e);
    const handleWindowDrop = (e: DragEvent) => handleDrop(e);

    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    return () => {
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
    };
  }, [handleDragEnter, handleDragLeave, handleDragOver, handleDrop]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Drag Overlay */}
      {isDragging && (
        <div
          ref={dropzoneRef}
          className={cn(
            'fixed inset-0 z-50',
            'bg-daw-bg-primary/90 backdrop-blur-sm',
            'flex items-center justify-center',
            'border-4 border-dashed border-daw-accent-primary',
            'transition-opacity duration-200'
          )}
        >
          <div className="text-center">
            <Upload className="mx-auto h-16 w-16 text-daw-accent-primary mb-4" />
            <h2 className="text-2xl font-bold text-daw-text-primary mb-2">
              Drop audio files here
            </h2>
            <p className="text-daw-text-muted">
              Supported formats: {acceptedExtensions}
            </p>
          </div>
        </div>
      )}

      {/* Upload Progress Toast */}
      {uploads.size > 0 && (
        <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
          {Array.from(uploads.entries()).map(([id, state]) => (
            <UploadToast key={id} state={state} />
          ))}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Upload Toast Component
// ─────────────────────────────────────────────────────────────────────────────

interface UploadToastProps {
  state: UploadState;
}

function UploadToast({ state }: UploadToastProps) {
  const { file, progress, status, error } = state;
  
  return (
    <div
      className={cn(
        'w-80 p-4 rounded-lg shadow-lg',
        'bg-daw-bg-secondary border border-daw-border-primary',
        'animate-in slide-in-from-right-5 duration-200'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Status Icon */}
        <div className="flex-shrink-0">
          {status === 'uploading' && (
            <Loader2 className="h-5 w-5 text-daw-accent-primary animate-spin" />
          )}
          {status === 'success' && (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          )}
          {status === 'error' && (
            <AlertCircle className="h-5 w-5 text-red-500" />
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-daw-text-primary truncate">
            {file.name}
          </p>
          
          {status === 'uploading' && (
            <div className="mt-2">
              <div className="h-1.5 w-full bg-daw-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-daw-accent-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-daw-text-muted">{progress}%</p>
            </div>
          )}
          
          {status === 'success' && (
            <p className="mt-1 text-xs text-green-500">Upload complete</p>
          )}
          
          {status === 'error' && (
            <p className="mt-1 text-xs text-red-500">{error || 'Upload failed'}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default UploadDropzone;
