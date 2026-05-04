import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/contexts/WalletContext";
import { FeedType } from "@/types/mog";
import { MogPostCard } from "@/components/mog/MogPostCard";
import { MogHeader } from "@/components/mog/MogHeader";
import { BottomNavigation } from "@/components/BottomNavigation";
import { AlertCircle, Loader2, RefreshCcw } from "lucide-react";
import { useMogPosts } from "@/hooks/useMogPosts";
import { Button } from "@/components/ui/button";

function MogEmptyVisual({ alt }: { alt: string }) {
  return (
    <div className="relative h-48 w-48 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] shadow-2xl shadow-black/40 sm:h-56 sm:w-56">
      <img
        src="/images/mog-empty-state.png"
        alt={alt}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
    </div>
  );
}

export default function Mog() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const [feedType, setFeedType] = useState<FeedType>('all');
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { 
    posts, 
    isLoading, 
    isError,
    error,
    isFetchingNextPage, 
    hasNextPage, 
    fetchNextPage,
    refetch,
  } = useMogPosts(feedType, address);

  // Infinite scroll observer
  useEffect(() => {
    const root = containerRef.current;
    if (!root || !loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { root, rootMargin: '400px 0px 400px 0px', threshold: 0.01 }
    );

    observer.observe(loadMoreRef.current);

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  useEffect(() => {
    setCurrentIndex(0);
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [feedType]);

  // Handle vertical scroll snap
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollTop = containerRef.current.scrollTop;
    const itemHeight = window.innerHeight;
    const newIndex = Math.round(scrollTop / itemHeight);
    if (newIndex !== currentIndex && newIndex >= 0 && newIndex < posts.length) {
      setCurrentIndex(newIndex);
    }

    // Prefetch when nearing end
    if (newIndex >= posts.length - 3 && hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [currentIndex, posts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' && currentIndex < posts.length - 1) {
        e.preventDefault();
        containerRef.current?.scrollTo({
          top: (currentIndex + 1) * window.innerHeight,
          behavior: 'smooth'
        });
      } else if (e.key === 'ArrowUp' && currentIndex > 0) {
        e.preventDefault();
        containerRef.current?.scrollTo({
          top: (currentIndex - 1) * window.innerHeight,
          behavior: 'smooth'
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, posts.length]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-landing-coral" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header with Following/For You tabs */}
      <MogHeader
        feedType={feedType}
        onFeedTypeChange={setFeedType}
        onSearch={() => navigate('/mog/search')}
        onUpload={() => navigate('/mog/upload')}
      />

      {/* Vertical scrolling container */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="h-screen overflow-y-scroll snap-y snap-mandatory scrollbar-hide"
      >
        {isError && (
          <div className="h-screen flex flex-col items-center justify-center gap-4 px-8 text-center bg-black">
            <MogEmptyVisual alt="" />
            <AlertCircle className="h-9 w-9 text-destructive" />
            <p className="text-lg font-medium text-white">Feed failed to load</p>
            <p className="max-w-sm text-sm text-white/70">
              {(error as Error | undefined)?.message || "Please try again."}
            </p>
            <Button onClick={() => refetch()} className="gap-2">
              <RefreshCcw className="h-4 w-4" />
              Retry
            </Button>
          </div>
        )}

        {posts.map((post, index) => (
          <MogPostCard
            key={post.id}
            post={post}
            isActive={index === currentIndex}
            onProfileClick={() => navigate(`/mog/profile/${post.creator_wallet}`)}
          />
        ))}

        {/* Load more trigger */}
        <div ref={loadMoreRef} className="h-1" />

        {/* Loading indicator */}
        {isFetchingNextPage && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}

        {!isFetchingNextPage && posts.length > 0 && !hasNextPage && (
          <div className="flex items-center justify-center py-10 text-sm text-white/50">
            You reached the end of this feed.
          </div>
        )}

        {!isError && posts.length === 0 && (
          <div className="h-screen flex flex-col items-center justify-center gap-4 px-8 text-center bg-black">
            <MogEmptyVisual alt="Empty Mog media frames waiting for creator posts" />
            <p className="text-xl font-medium text-white">
              {feedType === 'following' ? 'No posts from people you follow' : feedType === "all" ? "No posts yet" : `No ${feedType} posts yet`}
            </p>
            <p className="max-w-sm text-white/60">
              {feedType === 'following' 
                ? 'Follow creators to see their content here' 
                : 'Be the first to share something!'}
            </p>
            <Button
              onClick={() => navigate('/mog/upload')}
              className="mt-4 bg-landing-coral px-6 text-white hover:bg-landing-coral-light"
            >
              Create a Mog
            </Button>
          </div>
        )}
      </div>

      <BottomNavigation />
    </div>
  );
}
