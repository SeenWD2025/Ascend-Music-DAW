/**
 * Project page for Ascend DAW
 * Main workspace for audio production
 */

import { useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DAWShell } from '../components/daw/DAWShell';
import { useProjectStore } from '../stores/project.store';
import { getAudioEngine } from '../lib/audio';

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { setProject, setLoading, setError, clearProject } = useProjectStore();
  const engineInitialized = useRef(false);

  // Initialize project on mount
  useEffect(() => {
    if (!id) {
      navigate('/');
      return;
    }

    // Initialize audio engine (singleton)
    const initializeAudio = async () => {
      if (engineInitialized.current) return;

      try {
        const engine = getAudioEngine();
        // Note: Full initialization happens after user gesture via AudioContextOverlay
        engineInitialized.current = true;
      } catch (error) {
        console.error('[ProjectPage] Failed to get audio engine:', error);
        setError('Failed to initialize audio engine');
      }
    };

    // Load project data
    const loadProject = async () => {
      setLoading(true);
      setError(null);

      try {
        // TODO: Fetch project from API
        // For now, create a placeholder project
        const project = {
          id,
          name: 'Untitled Project',
          bpm: 120,
          timeSignature: { numerator: 4, denominator: 4 },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        setProject(project);
        await initializeAudio();
      } catch (error) {
        console.error('[ProjectPage] Failed to load project:', error);
        setError('Failed to load project');
      } finally {
        setLoading(false);
      }
    };

    loadProject();

    // Cleanup on unmount
    return () => {
      clearProject();
    };
  }, [id, navigate, setProject, setLoading, setError, clearProject]);

  // Render DAWShell - it includes MobileBlocker and AudioContextOverlay
  return <DAWShell />;
}

export default ProjectPage;
