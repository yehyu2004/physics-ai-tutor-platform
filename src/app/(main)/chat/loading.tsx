import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function ChatLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <LoadingSpinner message="Loading chat..." />
    </div>
  );
}
