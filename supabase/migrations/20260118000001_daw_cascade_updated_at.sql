-- Migration: DAW Cascade updated_at
-- Created: 2026-01-18
-- Description: Triggers to cascade updated_at from child tables to parent project

-- Function to cascade updated_at to project when tracks change
CREATE OR REPLACE FUNCTION public.cascade_track_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.daw_projects
  SET updated_at = now()
  WHERE id = COALESCE(NEW.project_id, OLD.project_id);
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Function to cascade updated_at to project when clips change
CREATE OR REPLACE FUNCTION public.cascade_clip_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  -- Get project_id via track
  SELECT project_id INTO v_project_id
  FROM public.daw_tracks
  WHERE id = COALESCE(NEW.track_id, OLD.track_id);
  
  IF v_project_id IS NOT NULL THEN
    UPDATE public.daw_projects
    SET updated_at = now()
    WHERE id = v_project_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Trigger for tracks
CREATE TRIGGER cascade_track_updated_at_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.daw_tracks
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_track_updated_at();

-- Trigger for clips
CREATE TRIGGER cascade_clip_updated_at_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.daw_clips
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_clip_updated_at();

-- Also cascade from plugins (they live on tracks)
CREATE OR REPLACE FUNCTION public.cascade_plugin_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id UUID;
BEGIN
  SELECT project_id INTO v_project_id
  FROM public.daw_tracks
  WHERE id = COALESCE(NEW.track_id, OLD.track_id);
  
  IF v_project_id IS NOT NULL THEN
    UPDATE public.daw_projects
    SET updated_at = now()
    WHERE id = v_project_id;
  END IF;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER cascade_plugin_updated_at_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.daw_plugins
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_plugin_updated_at();

-- Grants
GRANT EXECUTE ON FUNCTION public.cascade_track_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.cascade_clip_updated_at() TO service_role;
GRANT EXECUTE ON FUNCTION public.cascade_plugin_updated_at() TO service_role;
