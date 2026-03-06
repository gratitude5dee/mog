import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus, FolderKanban, Activity, Image, Sparkles, Settings, HelpCircle, ChevronDown, User, LogOut, Palette } from 'lucide-react';
import { motion } from 'framer-motion';
import { ProjectList } from '@/components/home/ProjectList';
import { ProjectListView } from '@/components/home/ProjectListView';
import { Sidebar } from '@/components/home/Sidebar';
import { MobileBottomNav } from '@/components/home/MobileBottomNav';
import { MobileHeader } from '@/components/home/MobileHeader';
import { MobileSidebarDrawer } from '@/components/home/MobileSidebarDrawer';
import { SearchBar } from '@/components/home/SearchBar';
import { SortDropdown, SortOption } from '@/components/home/SortDropdown';
import { ProjectViewModeSelector } from '@/components/home/ProjectViewModeSelector';
import { StatCard } from '@/components/home/StatCard';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { TextAnimate } from '@/components/ui/text-animate';
import { ShimmerButton } from '@/components/ui/shimmer-button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { useOnboardingTour } from '@/hooks/useOnboardingTour';
import { useSidebar } from '@/contexts/SidebarContext';
import { useCredits } from '@/hooks/useCredits';
import { cn } from '@/lib/utils';
import type { Project } from '@/components/home/ProjectCard';

type ViewMode = 'grid' | 'list';

// Demo projects for display
const getDemoProjects = (): Project[] => [
  {
    id: '1',
    title: 'Summer Vibes Mix',
    description: 'Chill electronic beats for summer',
    thumbnail_url: '',
    status: 'active',
    is_private: false,
    updated_at: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Lo-Fi Study Session',
    description: 'Relaxing lo-fi hip hop beats',
    thumbnail_url: '',
    status: 'active',
    is_private: true,
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '3',
    title: 'Ambient Soundscapes',
    description: 'Atmospheric ambient compositions',
    thumbnail_url: '',
    status: 'active',
    is_private: false,
    updated_at: new Date(Date.now() - 7200000).toISOString(),
  },
];

export default function Home() {
  const navigate = useNavigate();
  const { availableCredits } = useCredits();
  const { isCollapsed } = useSidebar();
  const onboarding = useOnboardingTour();

  const [activeView, setActiveView] = useState('all');
  const [activeTab, setActiveTab] = useState<'all' | 'private' | 'public'>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortBy, setSortBy] = useState<SortOption>('updated');
  const [searchQuery, setSearchQuery] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error] = useState<string | null>(null);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const fetchProjects = useCallback(async () => {
    setIsLoading(true);
    // Use demo projects for now
    setTimeout(() => {
      setProjects(getDemoProjects());
      setIsLoading(false);
    }, 500);
  }, []);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  const handleCreateProject = () => navigate('/upload');
  const handleOpenProject = (projectId: string) => navigate(`/watch/${projectId}`);

  const handleRenameProject = useCallback(async (projectId: string, newTitle: string) => {
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) return;
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId ? { ...project, title: trimmedTitle } : project
      )
    );
  }, []);

  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  const filteredProjects = projects
    .filter((project) => {
      if (activeTab === 'private' && !project.is_private) return false;
      if (activeTab === 'public' && project.is_private) return false;
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        return (
          project.title.toLowerCase().includes(query) ||
          project.description?.toLowerCase().includes(query)
        );
      }
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.title.localeCompare(b.title);
        case 'created':
        case 'updated':
        default:
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
    });

  const counts = {
    all: projects.length,
    private: projects.filter(p => p.is_private).length,
    public: projects.filter(p => !p.is_private).length,
  };

  const tabs = [
    { id: 'all' as const, label: 'All', count: counts.all },
    { id: 'private' as const, label: 'Private', count: counts.private },
    { id: 'public' as const, label: 'Public', count: counts.public },
  ];

  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Desktop Sidebar */}
      <div className="hidden md:block">
        <Sidebar activeView={activeView} onViewChange={setActiveView} />
      </div>

      {/* Mobile Sidebar Drawer */}
      <MobileSidebarDrawer
        isOpen={isMobileSidebarOpen}
        onClose={() => setIsMobileSidebarOpen(false)}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Main Content */}
      <motion.div
        className="flex-1 pb-20 md:pb-0"
        animate={{ marginLeft: isCollapsed ? 64 : 256 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        initial={false}
      >
        {/* Mobile Header */}
        <MobileHeader onMenuClick={() => setIsMobileSidebarOpen(true)} />

        {/* Desktop Header */}
        <header data-tour="dashboard-title" className={cn(
          "border-b border-border-default",
          "bg-gradient-to-r from-surface-2 via-transparent to-surface-2 backdrop-blur-sm",
          "hidden md:block"
        )}>
          {/* Row 1: Title + Actions */}
          <div className="h-16 flex items-center justify-between px-6">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <TextAnimate animation="blurInUp" by="word" className="text-xl font-semibold text-foreground">
                  Dashboard
                </TextAnimate>
                <motion.span
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3, type: "spring" }}
                  className="text-lg"
                >
                  📊
                </motion.span>
              </div>
              <div className="h-5 w-px bg-border" />
              <span className="text-sm text-muted-foreground font-medium">
                {filteredProjects.length} {filteredProjects.length === 1 ? 'project' : 'projects'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 px-2 gap-1 text-muted-foreground hover:text-foreground">
                    <Settings className="h-4 w-4" />
                    <ChevronDown className="h-3 w-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56" sideOffset={8}>
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Account</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => navigate('/mog/profile/me')} className="cursor-pointer">
                    <User className="mr-2 h-4 w-4" /> My Profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Preferences</DropdownMenuLabel>
                  <DropdownMenuItem className="cursor-pointer">
                    <Palette className="mr-2 h-4 w-4" /> Appearance
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate('/auth')} className="cursor-pointer text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.button
                    onClick={onboarding.start}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent/10 transition-all duration-200"
                  >
                    <HelpCircle className="w-4 h-4" />
                  </motion.button>
                </TooltipTrigger>
                <TooltipContent>Help & Tour</TooltipContent>
              </Tooltip>

              <ThemeToggle />
              <span className="text-xs text-primary bg-primary/15 px-2 py-0.5 rounded-full border border-primary/25 font-medium">
                ALPHA
              </span>
            </div>
          </div>

          {/* Row 2: Tabs + Search + Actions */}
          <div className="h-14 flex items-center justify-between px-6 border-t border-border/50">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/50">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200",
                    activeTab === tab.id
                      ? "text-foreground bg-background shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {tab.label}
                  <span className="ml-2 text-xs opacity-60">({tab.count})</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-4" data-tour="search-bar">
              <div className="w-72">
                <SearchBar onSearch={handleSearch} />
              </div>
              <SortDropdown value={sortBy} onChange={setSortBy} />
              <ProjectViewModeSelector viewMode={viewMode} setViewMode={setViewMode} />
            </div>

            <div className="flex items-center gap-3">
              <ShimmerButton
                data-tour="new-project-btn"
                onClick={handleCreateProject}
                shimmerColor="#ffffff"
                shimmerSize="0.05em"
                shimmerDuration="2.5s"
                background="linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary)/0.8) 100%)"
                className="h-9 px-4 text-sm font-medium"
              >
                <Plus className="w-4 h-4 mr-2" />
                <span>New Project</span>
              </ShimmerButton>
            </div>
          </div>
        </header>

        {/* Stats Row */}
        <div data-tour="stats-section" className="px-4 md:px-6 py-4 md:py-6 border-b border-border/50 bg-gradient-to-b from-muted/30 to-transparent">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatCard
              icon={<FolderKanban className="w-5 h-5" />}
              label="Total Projects"
              value={projects.length}
              trend="+12%"
              trendDirection="up"
              index={0}
            />
            <StatCard
              icon={<Activity className="w-5 h-5" />}
              label="Recent Activity"
              value={filteredProjects.filter(p => {
                const updated = new Date(p.updated_at);
                const weekAgo = new Date();
                weekAgo.setDate(weekAgo.getDate() - 7);
                return updated > weekAgo;
              }).length}
              trend="This week"
              trendDirection="neutral"
              index={1}
            />
            <StatCard
              icon={<Image className="w-5 h-5" />}
              label="Generated Assets"
              value="--"
              trend="Coming soon"
              trendDirection="neutral"
              className="hidden sm:block"
              index={2}
            />
            <StatCard
              icon={<Sparkles className="w-5 h-5" />}
              label="Credits"
              value={availableCredits?.toLocaleString() || '0'}
              trend="Available"
              trendDirection="neutral"
              className="hidden sm:block"
              index={3}
            />
          </div>
        </div>

        {/* Content Area */}
        <main data-tour="projects-section" className="p-4 md:p-6">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 md:py-20">
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/15 flex items-center justify-center mb-4">
                <Loader2 className="w-7 h-7 md:w-8 md:h-8 animate-spin text-primary" />
              </div>
              <p className="text-xs md:text-sm text-muted-foreground">Loading projects...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-12 md:py-20">
              <div className="text-center max-w-md px-4">
                <h3 className="text-base md:text-lg font-semibold text-foreground mb-2">Error Loading Projects</h3>
                <p className="text-xs md:text-sm text-muted-foreground mb-6">{error}</p>
                <button onClick={() => window.location.reload()} className="px-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground hover:bg-accent/10 transition-colors">
                  Retry
                </button>
              </div>
            </div>
          ) : filteredProjects.length === 0 && searchQuery ? (
            <div className="flex flex-col items-center justify-center py-12 md:py-20">
              <div className="text-center max-w-md px-4">
                <h3 className="text-base md:text-lg font-semibold text-foreground mb-2">No results found</h3>
                <p className="text-xs md:text-sm text-muted-foreground">Try adjusting your search or filters</p>
              </div>
            </div>
          ) : filteredProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 md:py-20">
              <div className="text-center max-w-md px-4">
                <div className="w-16 h-16 md:w-20 md:h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-primary/20 to-accent/15 flex items-center justify-center">
                  <Plus className="w-8 h-8 md:w-10 md:h-10 text-primary" />
                </div>
                <h3 className="text-lg md:text-xl font-semibold text-foreground mb-2">Create your first project</h3>
                <p className="text-xs md:text-sm text-muted-foreground mb-6">Start bringing your ideas to life</p>
                <button onClick={handleCreateProject} className={cn(
                  "px-6 py-3 rounded-xl text-sm font-medium transition-all duration-200",
                  "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground",
                  "hover:shadow-[0_0_30px_hsl(var(--primary)/0.4)] hover:-translate-y-0.5"
                )}>
                  Create Project
                </button>
              </div>
            </div>
          ) : viewMode === 'list' ? (
            <ProjectListView
              projects={filteredProjects}
              onOpenProject={handleOpenProject}
              onRefresh={fetchProjects}
            />
          ) : (
            <ProjectList
              projects={filteredProjects}
              onOpenProject={handleOpenProject}
              onCreateProject={handleCreateProject}
              onRenameProject={handleRenameProject}
            />
          )}
        </main>
      </motion.div>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        activeView={activeView}
        onViewChange={setActiveView}
        onCreateProject={handleCreateProject}
      />
    </div>
  );
}
