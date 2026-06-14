import { useCallback, useState } from "react";
import { apiFetch } from "@/lib/api-client";

export type UseThresholdsOptions = {
  ready: boolean;
  workspaceId: string | null;
};

export function useThresholds({ ready, workspaceId }: UseThresholdsOptions) {
  const [low, setLow] = useState(35);
  const [high, setHigh] = useState(70);
  const [dirty, setDirty] = useState(false);

  const fetchThresholds = useCallback(async () => {
    if (!ready) return;
    if (!workspaceId) {
      setLow(35);
      setHigh(70);
      setDirty(false);
      return;
    }
    const res = await apiFetch("/api/automation");
    if (!res.ok) return;
    const data = await res.json();
    setLow(data.low ?? 35);
    setHigh(data.high ?? 70);
    setDirty(false);
  }, [ready, workspaceId]);

  const updateLow = (value: number) => {
    setLow(value);
    setDirty(true);
  };

  const updateHigh = (value: number) => {
    setHigh(value);
    setDirty(true);
  };

  const saveThresholds = async (): Promise<boolean> => {
    const res = await apiFetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ low, high }),
    });
    // Keep the form dirty on failure so the user knows the change didn't persist.
    if (!res.ok) return false;
    setDirty(false);
    return true;
  };

  return {
    low,
    high,
    dirty,
    fetchThresholds,
    updateLow,
    updateHigh,
    saveThresholds,
  };
}
