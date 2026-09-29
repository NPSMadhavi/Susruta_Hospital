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
  const startItem = (safeCurrentPage - 1) * pageSize + 1;
  const endItem = Math.min(safeCurrentPage * pageSize, totalItems);
  const pageNumbers = getPageNumbers(safeCurrentPage, totalPages);

  return (
    <div
      className={cn(
        "flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3.5 border-t border-border bg-white text-xs text-muted-foreground",
        className
      )}
    >
      <div>
        Showing <strong className="font-semibold text-foreground">{startItem}</strong> to{" "}
        <strong className="font-semibold text-foreground">{endItem}</strong> of{" "}
        <strong className="font-semibold text-foreground">{totalItems}</strong> {itemLabel}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Previous Button */}
        <button
          type="button"
          onClick={() => onPageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage <= 1}
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-white text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-xs shadow-sm"
          title="Previous Page"
        >
          <ChevronLeft size={14} />
          <span>Previous</span>
        </button>

        {/* Page Numbers */}
        <div className="flex items-center gap-1">
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
                  "w-8 h-8 rounded-xl text-xs font-semibold flex items-center justify-center transition-all",
                  isActive
                    ? "bg-[#D95B2F] text-white shadow-sm"
                    : "border border-border bg-white text-foreground hover:bg-muted"
                )}
                aria-current={isActive ? "page" : undefined}
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
          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-border bg-white text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors font-medium text-xs shadow-sm"
          title="Next Page"
        >
          <span>Next</span>
          <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
