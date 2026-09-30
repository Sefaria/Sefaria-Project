import React, { useEffect, useRef } from 'react';

function SkeletonCard() {
  return (
    <div className="searchLoadSkeleton-card">
      <div className="searchLoadSkeleton-cardAccent" />
      <div className="searchLoadSkeleton-cardContent">
        <div className="searchLoadSkeleton-shimmer searchLoadSkeleton-cardTitle" />
        <div className="searchLoadSkeleton-cardLines">
          <div className="searchLoadSkeleton-shimmer searchLoadSkeleton-cardLine" />
          <div className="searchLoadSkeleton-shimmer searchLoadSkeleton-cardLine" />
          <div className="searchLoadSkeleton-shimmer searchLoadSkeleton-cardLine" />
          <div className="searchLoadSkeleton-shimmer searchLoadSkeleton-cardLine" />
        </div>
      </div>
    </div>
  );
}

function SearchLoadSkeleton() {
  const ref = useRef(null);

  useEffect(() => {
    const scrollContainer = ref.current?.closest('.content');
    if (!scrollContainer) return;
    const prevOverflowY = scrollContainer.style.overflowY;
    scrollContainer.style.overflowY = 'hidden';
    return () => { scrollContainer.style.overflowY = prevOverflowY; };
  }, []);

  return (
    <div ref={ref} className="searchLoadSkeleton" aria-hidden="true">
      <div className="searchLoadSkeleton-tabs">
        <div className="searchLoadSkeleton-shimmer searchLoadSkeleton-tab" />
        <div className="searchLoadSkeleton-shimmer searchLoadSkeleton-tab" />
        <div className="searchLoadSkeleton-shimmer searchLoadSkeleton-tab" />
        <div className="searchLoadSkeleton-shimmer searchLoadSkeleton-tab" />
      </div>
      <div className="searchLoadSkeleton-sortRow">
        <div className="searchLoadSkeleton-shimmer searchLoadSkeleton-sort" />
      </div>
      <div className="searchLoadSkeleton-results">
        {Array.from({ length: 11 }, (_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  );
}

export default SearchLoadSkeleton;
