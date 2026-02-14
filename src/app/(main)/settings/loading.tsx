import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function SettingsLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <LoadingSpinner message="Loading settings..." />
    </div>
  );
}
