import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useWallet } from "@/contexts/WalletContext";
import { FeedType } from "@/types/mog";
import { MogPostCard } from "@/components/mog/MogPostCard";
import { MogHeader } from "@/components/mog/MogHeader";
import { BottomNavigation } from "@/components/BottomNavigation";
import { Loader2 } from "lucide-react";
import { useMogPosts } from "@/hooks/useMogPosts";

export default function Mog() {
  const navigate = useNavigate();
  const { address } = useWallet();
  const [feedType, setFeedType] = useState<FeedType>('foryou');
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const { 
    posts, 
    isLoading, 
    isFetchingNextPage, 
    hasNextPage, 
    fetchNextPage 
  } = useMogPosts(feedType, address);

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: '200px' }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
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

        {posts.length === 0 && (
          <div className="h-screen flex flex-col items-center justify-center gap-4 px-8 text-center">
            <p className="text-xl font-medium text-foreground">
              {feedType === 'following' ? 'No posts from people you follow' : 'No posts yet'}
            </p>
            <p className="text-muted-foreground">
              {feedType === 'following' 
                ? 'Follow creators to see their content here' 
                : 'Be the first to share something!'}
            </p>
            <button
              onClick={() => navigate('/mog/upload')}
              className="bg-primary text-primary-foreground px-6 py-3 rounded-full font-medium mt-4"
            >
              Create a Mog
            </button>
          </div>
        )}
      </div>

      <BottomNavigation />
    </div>
  );
}
