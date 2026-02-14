import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function AnalyticsLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <LoadingSpinner message="Loading analytics..." />
    </div>
  );
}
