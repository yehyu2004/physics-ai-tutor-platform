import { LoadingSpinner } from "@/components/ui/loading-spinner";

export default function MainLoading() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <LoadingSpinner message="Loading..." />
    </div>
  );
}
