import React from 'react';

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
  return (
    <div className="searchLoadSkeleton" aria-hidden="true">
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
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

export default SearchLoadSkeleton;
