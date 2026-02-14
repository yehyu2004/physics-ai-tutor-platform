import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function EmailRecordsLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <LoadingSpinner message="Loading email records..." />
    </div>
  );
}
