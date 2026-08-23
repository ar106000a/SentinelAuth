import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { dashboardApi } from "./api";

export function useDashboardAuth() {
  const router = useRouter();
  const [me, setMe] = useState<Awaited<ReturnType<typeof dashboardApi.me>> | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    dashboardApi
      .me()
      .then(setMe)
      .catch(() => router.push("/login"))
      .finally(() => setChecked(true));
  }, [router]);

  return { me, checked };
}