import { useEffect } from "react";

/**
 * Centralized Modal Scroll Lock with reference-counting.
 *
 * Guarantees:
 * 1. Background page (document.body & document.documentElement) scrolling is completely disabled.
 * 2. Mobile touch/swipe scrolling of the background is prevented via fixed body pinning.
 * 3. Mouse-wheel scrolling cannot move the page behind the popup on desktop.
 * 4. User's exact previous scroll position (both window.scrollY and desktop <main> scrollTop) is preserved.
 * 5. Nested/multiple concurrent modals are supported cleanly without unlocking prematurely.
 * 6. Desktop layout shifts from disappearing scrollbars are prevented by compensating paddingRight.
 * 7. When the last modal closes, all lock styles and data attributes are cleanly removed.
 */

let lockCount = 0;
let savedScrollY = 0;
let savedMainScrollTop = 0;

interface SavedBodyStyles {
  position: string;
  top: string;
  left: string;
  right: string;
  width: string;
  overflow: string;
  paddingRight: string;
  touchAction: string;
}

interface SavedHtmlStyles {
  overflow: string;
  scrollBehavior: string;
}

let savedBodyStyle: SavedBodyStyles | null = null;
let savedHtmlStyle: SavedHtmlStyles | null = null;

export function lockScroll(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  lockCount++;
  if (lockCount > 1) {
    // Already locked by an existing open modal; keep the original scroll position saved.
    return;
  }

  // 1. Record current scroll position
  savedScrollY =
    window.scrollY ||
    window.pageYOffset ||
    document.documentElement.scrollTop ||
    document.body.scrollTop ||
    0;

  const mainEl = document.querySelector("main");
  savedMainScrollTop = mainEl ? mainEl.scrollTop : 0;

  // 2. Measure scrollbar width to prevent desktop layout jump
  const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;

  // 3. Save original inline styles
  const body = document.body;
  const html = document.documentElement;

  savedBodyStyle = {
    position: body.style.position,
    top: body.style.top,
    left: body.style.left,
    right: body.style.right,
    width: body.style.width,
    overflow: body.style.overflow,
    paddingRight: body.style.paddingRight,
    touchAction: body.style.touchAction,
  };

  savedHtmlStyle = {
    overflow: html.style.overflow,
    scrollBehavior: html.style.scrollBehavior,
  };

  // 4. Apply scroll lock to <html>
  html.style.scrollBehavior = "auto";
  html.style.overflow = "hidden";

  // 5. Apply scroll lock to <body>
  // Fixed positioning at -${savedScrollY}px is the gold-standard fix for iOS Safari touch scrolling
  body.style.position = "fixed";
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overflow = "hidden";
  body.style.touchAction = "none";
  if (scrollbarWidth > 0) {
    body.style.paddingRight = `${scrollbarWidth}px`;
  }

  body.setAttribute("data-modal-scroll-locked", "true");
  html.setAttribute("data-modal-scroll-locked", "true");
}

export function unlockScroll(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  if (lockCount <= 0) {
    lockCount = 0;
    return;
  }

  lockCount--;
  if (lockCount > 0) {
    // Other modals are still open
    return;
  }

  // 1. Restore body inline styles
  const body = document.body;
  const html = document.documentElement;

  if (savedBodyStyle) {
    body.style.position = savedBodyStyle.position;
    body.style.top = savedBodyStyle.top;
    body.style.left = savedBodyStyle.left;
    body.style.right = savedBodyStyle.right;
    body.style.width = savedBodyStyle.width;
    body.style.overflow = savedBodyStyle.overflow;
    body.style.paddingRight = savedBodyStyle.paddingRight;
    body.style.touchAction = savedBodyStyle.touchAction;
    savedBodyStyle = null;
  } else {
    body.style.position = "";
    body.style.top = "";
    body.style.left = "";
    body.style.right = "";
    body.style.width = "";
    body.style.overflow = "";
    body.style.paddingRight = "";
    body.style.touchAction = "";
  }

  // 2. Restore html inline styles
  if (savedHtmlStyle) {
    html.style.overflow = savedHtmlStyle.overflow;
    html.style.scrollBehavior = savedHtmlStyle.scrollBehavior;
    savedHtmlStyle = null;
  } else {
    html.style.overflow = "";
    html.style.scrollBehavior = "";
  }

  body.removeAttribute("data-modal-scroll-locked");
  html.removeAttribute("data-modal-scroll-locked");

  // 3. Restore window scroll position immediately without animation
  window.scrollTo(0, savedScrollY);

  // 4. Restore desktop main scroll position if applicable
  const mainEl = document.querySelector("main");
  if (mainEl && savedMainScrollTop > 0) {
    mainEl.scrollTop = savedMainScrollTop;
  }
}

/**
 * Hook to lock background scrolling whenever `isLocked` is true.
 * Automatically unlocks on unmount or when `isLocked` flips to false.
 */
export function useScrollLock(isLocked: boolean = true): void {
  useEffect(() => {
    if (!isLocked) return;
    lockScroll();
    return () => {
      unlockScroll();
    };
  }, [isLocked]);
}
