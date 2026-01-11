/**
 * Home page for Ascend DAW
 * Landing page with project creation and recent projects list
 */

import { Plus, Music2, Clock, Folder } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

/**
 * Mock recent projects for UI placeholder
 * TODO: Replace with actual project data from API
 */
const mockRecentProjects = [
  { id: '1', name: 'Summer Vibes', updatedAt: '2 hours ago' },
  { id: '2', name: 'Rock Anthem', updatedAt: 'Yesterday' },
  { id: '3', name: 'Lo-fi Beats', updatedAt: '3 days ago' },
];

export function HomePage() {
  const navigate = useNavigate();

  const handleCreateProject = () => {
    // TODO: Create project via API and navigate to new project
    // For now, navigate to a placeholder project
    const newProjectId = crypto.randomUUID();
    navigate(`/project/${newProjectId}`);
  };

  const handleOpenProject = (projectId: string) => {
    navigate(`/project/${projectId}`);
  };

  return (
    <div className="min-h-screen bg-daw-bg-primary text-daw-text-primary">
      {/* Header */}
      <header className="border-b border-daw-border-primary">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-center gap-3">
            <Music2 className="w-10 h-10 text-daw-accent-primary" />
            <div>
              <h1 className="text-3xl font-bold">Ascend DAW</h1>
              <p className="text-daw-text-muted text-sm">
                Digital Audio Workstation
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Create new project section */}
        <section className="mb-16">
          <button
            onClick={handleCreateProject}
            className={cn(
              'group w-full max-w-md p-8 rounded-xl',
              'bg-daw-bg-secondary border-2 border-dashed border-daw-border-primary',
              'hover:border-daw-accent-primary hover:bg-daw-bg-tertiary',
              'transition-all duration-200',
              'flex flex-col items-center gap-4'
            )}
          >
            <div
              className={cn(
                'w-16 h-16 rounded-full',
                'bg-daw-accent-primary/10 group-hover:bg-daw-accent-primary/20',
                'flex items-center justify-center',
                'transition-colors duration-200'
              )}
            >
              <Plus className="w-8 h-8 text-daw-accent-primary" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-semibold mb-1">Create New Project</h2>
              <p className="text-daw-text-muted text-sm">
                Start a new music production from scratch
              </p>
            </div>
          </button>
        </section>

        {/* Recent projects section */}
        <section>
          <div className="flex items-center gap-2 mb-6">
            <Clock className="w-5 h-5 text-daw-text-muted" />
            <h2 className="text-xl font-semibold">Recent Projects</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {mockRecentProjects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleOpenProject(project.id)}
                className={cn(
                  'p-6 rounded-lg text-left',
                  'bg-daw-bg-secondary border border-daw-border-primary',
                  'hover:border-daw-accent-primary hover:bg-daw-bg-tertiary',
                  'transition-all duration-200',
                  'group'
                )}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      'w-12 h-12 rounded-lg flex-shrink-0',
                      'bg-daw-bg-tertiary group-hover:bg-daw-accent-primary/20',
                      'flex items-center justify-center',
                      'transition-colors duration-200'
                    )}
                  >
                    <Folder className="w-6 h-6 text-daw-text-muted group-hover:text-daw-accent-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium truncate mb-1">
                      {project.name}
                    </h3>
                    <p className="text-sm text-daw-text-muted">
                      {project.updatedAt}
                    </p>
                  </div>
                </div>
              </button>
            ))}

            {/* Empty state placeholder */}
            {mockRecentProjects.length === 0 && (
              <div className="col-span-full py-12 text-center">
                <Folder className="w-12 h-12 text-daw-text-muted mx-auto mb-4" />
                <p className="text-daw-text-muted">
                  No recent projects yet. Create your first project to get
                  started!
                </p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-daw-border-primary mt-auto">
        <div className="max-w-6xl mx-auto px-6 py-6">
          <p className="text-sm text-daw-text-muted text-center">
            Ascend DAW &copy; {new Date().getFullYear()} — Professional music
            production in your browser
          </p>
        </div>
      </footer>
    </div>
  );
}

export default HomePage;
