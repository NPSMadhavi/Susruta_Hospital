import React, { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { Loader2, ZoomIn, ZoomOut, RotateCw } from "lucide-react";

// Polyfill Promise.withResolvers if needed
if (typeof (Promise as any).withResolvers === "undefined") {
  (Promise as any).withResolvers = function () {
    let resolve: any, reject: any;
    const promise = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

// Configure PDF.js worker
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
}

interface CleanPdfViewerProps {
  url: string;
  title?: string;
  className?: string;
}

interface PageItem {
  pageNum: number;
  page: any;
}

function SinglePdfPage({
  page,
  scale,
  rotation,
}: {
  page: any;
  scale: number;
  rotation: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    if (!page || !canvasRef.current) return;

    if (renderTaskRef.current) {
      try {
        renderTaskRef.current.cancel();
      } catch {}
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const pixelRatio = Math.max(window.devicePixelRatio || 1, 1.5);
    const viewport = page.getViewport({ scale: scale * pixelRatio, rotation });

    canvas.width = viewport.width;
    canvas.height = viewport.height;
    canvas.style.width = `${viewport.width / pixelRatio}px`;
    canvas.style.height = `${viewport.height / pixelRatio}px`;

    const renderContext = {
      canvasContext: ctx,
      viewport,
    };

    const task = page.render(renderContext);
    renderTaskRef.current = task;

    task.promise.catch((err: any) => {
      if (err?.name !== "RenderingCancelledException") {
        console.error("PDF page render error:", err);
      }
    });

    return () => {
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch {}
      }
    };
  }, [page, scale, rotation]);

  return (
    <div className="bg-white shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-gray-200/90 rounded-sm overflow-hidden select-none shrink-0 my-2 transition-all">
      <canvas ref={canvasRef} className="block pointer-events-none" />
    </div>
  );
}

export function CleanPdfViewer({ url, title, className = "" }: CleanPdfViewerProps) {
  const [pages, setPages] = useState<PageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    setPages([]);

    const loadingTask = pdfjsLib.getDocument({
      url,
      withCredentials: true,
    });

    loadingTask.promise
      .then(async (pdf) => {
        if (!active) return;
        const loaded: PageItem[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          loaded.push({ pageNum: i, page });
        }
        if (active) {
          setPages(loaded);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!active) return;
        console.error("PDF loading error:", err);
        setError("Unable to render PDF document inline.");
        setLoading(false);
      });

    return () => {
      active = false;
      try {
        loadingTask.destroy();
      } catch {}
    };
  }, [url]);

  // Keyboard navigation for scrolling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!scrollContainerRef.current) return;
      if (e.key === "ArrowDown") {
        scrollContainerRef.current.scrollBy({ top: 80, behavior: "smooth" });
      } else if (e.key === "ArrowUp") {
        scrollContainerRef.current.scrollBy({ top: -80, behavior: "smooth" });
      } else if (e.key === "PageDown") {
        scrollContainerRef.current.scrollBy({ top: 320, behavior: "smooth" });
      } else if (e.key === "PageUp") {
        scrollContainerRef.current.scrollBy({ top: -320, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const zoomIn = useCallback(() => setScale((s) => Math.min(s + 0.15, 2.5)), []);
  const zoomOut = useCallback(() => setScale((s) => Math.max(s - 0.15, 0.5)), []);
  const rotate = useCallback(() => setRotation((r) => (r + 90) % 360), []);

  if (loading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-50/50 p-8">
        <Loader2 size={32} className="animate-spin text-emerald-600 mb-3" />
        <p className="text-xs text-gray-500 font-medium">Loading document...</p>
      </div>
    );
  }

  if (error || pages.length === 0) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center p-6 bg-white">
        <iframe
          src={`${url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
          title={title || "PDF Document"}
          className="w-full h-full border-0 bg-white"
        />
      </div>
    );
  }

  return (
    <div className={`relative w-full h-full min-h-0 flex flex-col bg-[#f8fafc] overflow-hidden ${className}`}>
      {/* Floating zoom/rotate toolbar */}
      <div className="absolute bottom-5 right-6 z-20 flex items-center gap-1 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-full shadow-lg border border-gray-200 text-gray-700 select-none">
        <button
          type="button"
          onClick={zoomOut}
          className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={16} />
        </button>
        <span className="text-[11px] font-semibold text-gray-600 min-w-[36px] text-center">
          {Math.round(scale * 100)}%
        </span>
        <button
          type="button"
          onClick={zoomIn}
          className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={16} />
        </button>
        <div className="w-px h-3.5 bg-gray-200 mx-1" />
        <button
          type="button"
          onClick={rotate}
          className="p-1 hover:text-gray-900 hover:bg-gray-100 rounded-full transition-colors"
          title="Rotate"
        >
          <RotateCw size={15} />
        </button>
      </div>

      {/* Pages Container with Visible, Smooth Scrolling */}
      <div
        ref={scrollContainerRef}
        tabIndex={0}
        className="flex-1 min-h-0 w-full overflow-y-auto overflow-x-auto p-4 sm:p-8 pb-32 flex flex-col items-center gap-6 focus:outline-none scroll-smooth"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "#94a3b8 #f1f5f9",
        }}
      >
        {pages.map((item) => (
          <SinglePdfPage
            key={item.pageNum}
            page={item.page}
            scale={scale}
            rotation={rotation}
          />
        ))}
      </div>
    </div>
  );
}
