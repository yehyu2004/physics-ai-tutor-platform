import { type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  /** Lucide icon component */
  icon: LucideIcon;
  /** Main heading text */
  title: string;
  /** Optional subtitle/description */
  description?: string;
  /** Optional action button or other content */
  children?: React.ReactNode;
  /** Custom className for the outer container */
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={
        className ||
        "bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 py-16 text-center shadow-sm"
      }
    >
      <div className="mx-auto w-14 h-14 rounded-full bg-gray-50 dark:bg-gray-800 flex items-center justify-center mb-4">
        <Icon className="h-7 w-7 text-gray-400 dark:text-gray-500" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
        {title}
      </h3>
      {description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
          {description}
        </p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
