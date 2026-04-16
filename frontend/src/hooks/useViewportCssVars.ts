import { useEffect } from "react";

const FALLBACK_VH = "100dvh";

const readViewportHeight = () => {
  if (typeof window === "undefined") {
    return FALLBACK_VH;
  }

  const vv = window.visualViewport;
  const height = vv?.height ?? window.innerHeight;
  return `${Math.round(height)}px`;
};

export function useViewportCssVars() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const root = document.documentElement;

    const syncViewportVars = () => {
      root.style.setProperty("--app-vh", readViewportHeight());
    };

    syncViewportVars();

    window.addEventListener("resize", syncViewportVars, { passive: true });
    window.addEventListener("orientationchange", syncViewportVars, { passive: true });

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener("resize", syncViewportVars, { passive: true });
      vv.addEventListener("scroll", syncViewportVars, { passive: true });
    }

    return () => {
      window.removeEventListener("resize", syncViewportVars);
      window.removeEventListener("orientationchange", syncViewportVars);
      if (vv) {
        vv.removeEventListener("resize", syncViewportVars);
        vv.removeEventListener("scroll", syncViewportVars);
      }
    };
  }, []);
}
