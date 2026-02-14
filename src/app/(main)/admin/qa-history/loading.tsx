import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function QAHistoryLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <LoadingSpinner message="Loading Q&A history..." />
    </div>
  );
}
