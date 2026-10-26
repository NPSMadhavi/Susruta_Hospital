import React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AdminPaginationProps {
  currentPage: number;
  totalItems: number;
  pageSize?: number;
  onPageChange: (page: number) => void;
  className?: string;
  itemLabel?: string;
}


function getMobilePageNumbers(currentPage: number, totalPages: number): number[] {
  if (totalPages <= 2) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage >= totalPages) {
    return [totalPages - 1, totalPages];
  }
  const start = currentPage % 2 === 1 ? currentPage : currentPage - 1;
  const end = Math.min(start + 1, totalPages);
  if (start === end && start > 1) {
    return [start - 1, start];
  }
  return [start, end];
}

function getPageNumbers(currentPage: number, totalPages: number): (number | "ellipsis")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  const pages: (number | "ellipsis")[] = [1];
  
  if (currentPage > 3) {
    pages.push("ellipsis");
  }

  const start = Math.max(2, currentPage - 1);
  const end = Math.min(totalPages - 1, currentPage + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (currentPage < totalPages - 2) {
    pages.push("ellipsis");
  }

  pages.push(totalPages);
  return pages;
}

export function AdminPagination({
  currentPage,
  totalItems,
  pageSize = 10,
  onPageChange,
  className,
  itemLabel = "records",
}: AdminPaginationProps) {
  // Only enable pagination when total items exceed the page size (e.g. after 10 records)
  if (totalItems <= pageSize) {
    return null;
  }

  const totalPages = Math.ceil(totalItems / pageSize);
  const safeCurrentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const pageNumbers = getPageNumbers(safeCurrentPage, totalPages);
  const mobilePageNumbers = getMobilePageNumbers(safeCurrentPage, totalPages);

  React.useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      onPageChange(totalPages);
    }
  }, [currentPage, totalPages, onPageChange]);

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-center justify-between gap-3 px-3.5 sm:px-5 py-3 sm:py-3.5 border-t border-border bg-white text-xs text-muted-foreground mt-auto shrink-0 w-full",
        className
      )}
    >
      <div className="text-center sm:text-left text-[11px] sm:text-xs">
        Page <strong className="font-semibold text-foreground">{safeCurrentPage}</strong> of{" "}
        <strong className="font-semibold text-foreground">{totalPages}</strong>
      </div>

      <div className="flex items-center justify-center gap-1 sm:gap-1.5 flex-nowrap">
        {/* Previous Button */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage <= 1}
          className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl border border-border bg-white text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-xs shadow-sm min-h-[32px] cursor-pointer whitespace-nowrap"
          title="Previous Page"
          aria-label="Previous Page"
        >
          <ChevronLeft size={14} />
          <span>Previous</span>
        </button>

        {/* Mobile Page Numbers (at most 2 pages to stay on 1 line: previous 1, 2 next) */}
        <div className="flex sm:hidden items-center gap-1">
          {mobilePageNumbers.map((p) => {
            const isActive = p === safeCurrentPage;
            return (
              <button
                key={`mobile-${p}`}
                type="button"
                onClick={() => onPageChange(p)}
                className={cn(
                  "w-7 h-7 rounded-xl text-xs font-semibold flex items-center justify-center transition-all min-h-[28px] cursor-pointer",
                  isActive
                    ? "bg-[#D95B2F] text-white shadow-sm"
                    : "border border-border bg-white text-foreground hover:bg-muted"
                )}
                aria-current={isActive ? "page" : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Desktop / Tablet Page Numbers */}
        <div className="hidden sm:flex items-center gap-1">
          {pageNumbers.map((p, idx) => {
            if (p === "ellipsis") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="w-8 h-8 flex items-center justify-center text-muted-foreground"
                >
                  <MoreHorizontal size={14} />
                </span>
              );
            }

            const isActive = p === safeCurrentPage;
            return (
              <button
                key={p}
                type="button"
                onClick={() => onPageChange(p)}
                className={cn(
                  "w-8 h-8 rounded-xl text-xs font-semibold flex items-center justify-center transition-all min-h-[32px] cursor-pointer",
                  isActive
                    ? "bg-[#D95B2F] text-white shadow-sm"
                    : "border border-border bg-white text-foreground hover:bg-muted"
                )}
                aria-current={isActive ? "page" : undefined}
                aria-label={`Page ${p}`}
              >
                {p}
              </button>
            );
          })}
        </div>

        {/* Next Button */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage >= totalPages}
          className="inline-flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-xl border border-border bg-white text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-xs shadow-sm min-h-[32px] cursor-pointer whitespace-nowrap"
          title="Next Page"
          aria-label="Next Page"
        >
          <span>Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
export { AdminPagination as Pagination };
