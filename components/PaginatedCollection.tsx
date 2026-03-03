'use client';

/**
 * PaginatedCollection Component
 *
 * Client component that handles pagination for collection layers.
 * Hydrates from SSR with initial items and supports full-page navigation.
 * 
 * Features:
 * - URL-based pagination with stripped layer ID params (?p_ID=N)
 * - Independent pagination for multiple collections on the same page
 * - Loading state during page transitions
 * - Previous/Next button state management
 *
 * Navigation uses window.location.href (not router.push) so the proxy
 * middleware can rewrite p_ params to the /dynamic route.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useSearchParams, usePathname } from 'next/navigation';
import type { CollectionPaginationMeta, Layer } from '@/types';

function stripLayerPrefix(id: string): string {
  return id.startsWith('lyr-') ? id.slice(4) : id;
}

interface PaginatedCollectionProps {
  children: React.ReactNode;
  paginationMeta: CollectionPaginationMeta;
  collectionLayerId: string;
}

export default function PaginatedCollection({
  children,
  paginationMeta,
  collectionLayerId,
}: PaginatedCollectionProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, setIsPending] = useState(false);
  
  const { currentPage, totalPages, totalItems, itemsPerPage } = paginationMeta;

  const navigateToPage = useCallback((page: number) => {
    if (page < 1 || page > totalPages) return;
    
    const params = new URLSearchParams(searchParams.toString());
    const paramKey = `p_${stripLayerPrefix(collectionLayerId)}`;
    
    if (page === 1) {
      params.delete(paramKey);
    } else {
      params.set(paramKey, String(page));
    }
    
    const newUrl = params.toString() ? `${pathname}?${params.toString()}` : pathname;
    
    setIsPending(true);
    window.location.href = newUrl;
  }, [pathname, searchParams, totalPages, collectionLayerId]);

  // Handle click events on pagination buttons (delegated)
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const button = target.closest('[data-pagination-action]') as HTMLElement;
      
      if (!button) return;
      
      const action = button.getAttribute('data-pagination-action');
      const layerId = button.getAttribute('data-collection-layer-id');
      
      // Only handle clicks for this collection's pagination
      if (layerId !== collectionLayerId) return;
      
      e.preventDefault();
      
      if (action === 'prev' && currentPage > 1) {
        navigateToPage(currentPage - 1);
      } else if (action === 'next' && currentPage < totalPages) {
        navigateToPage(currentPage + 1);
      }
    };
    
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [collectionLayerId, currentPage, totalPages, navigateToPage]);

  return (
    <div 
      className={`relative ${isPending ? 'opacity-50 pointer-events-none' : ''}`}
      data-paginated-collection={collectionLayerId}
    >
      {/* Loading overlay */}
      {isPending && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900" />
        </div>
      )}
      
      {/* Collection content - rendered from SSR */}
      {children}
    </div>
  );
}

/**
 * Skeleton placeholder for collection items during loading
 */
export function CollectionSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div 
          key={i}
          className="animate-pulse bg-gray-200 rounded-lg h-32"
        />
      ))}
    </div>
  );
}
