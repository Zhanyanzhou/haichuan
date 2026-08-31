import { useEffect } from "react";

type HistoryDirection = "back" | "forward";

export default function useWorkspaceHistoryShortcuts({
  disabled = false,
  onNavigate,
}: {
  disabled?: boolean;
  onNavigate: (direction: HistoryDirection) => boolean;
}) {
  useEffect(() => {
    if (disabled) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || (!event.ctrlKey && !event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key !== "z" && key !== "y") return;
      const direction = key === "y" || event.shiftKey ? "forward" : "back";
      if (onNavigate(direction)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [disabled, onNavigate]);
}
