import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  /** Optional message below the spinner */
  message?: string;
  /** Custom className for the container */
  className?: string;
}

export function LoadingSpinner({ message, className }: LoadingSpinnerProps) {
  return (
    <div className={className || "flex flex-col items-center justify-center py-20 gap-3"} role="status" aria-label={message || "Loading"}>
      <Loader2 className="h-8 w-8 animate-spin text-gray-400 dark:text-gray-500" aria-hidden="true" />
      {message && (
        <p className="text-sm text-gray-400 dark:text-gray-500">{message}</p>
      )}
    </div>
  );
}
