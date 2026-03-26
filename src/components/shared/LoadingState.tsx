"use client";

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = "Loading..." }: LoadingStateProps) {
  return (
    <div
      data-design-id="loading-state"
      className="flex flex-col items-center justify-center py-12"
    >
      <div
        data-design-id="loading-spinner"
        className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin"
      />
      <p
        data-design-id="loading-message"
        className="mt-4 text-slate-600 text-sm"
      >
        {message}
      </p>
    </div>
  );
}

export function PageLoadingState({ message }: LoadingStateProps) {
  return (
    <div
      data-design-id="page-loading-state"
      className="min-h-[400px] flex items-center justify-center"
    >
      <LoadingState message={message} />
    </div>
  );
}