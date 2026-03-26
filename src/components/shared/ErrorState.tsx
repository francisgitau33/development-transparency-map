"use client";

import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div
      data-design-id="error-state"
      className="flex flex-col items-center justify-center py-12 px-4"
    >
      <div
        data-design-id="error-icon-container"
        className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4"
      >
        <AlertCircle className="w-8 h-8 text-red-600" />
      </div>
      <h3
        data-design-id="error-title"
        className="text-lg font-semibold text-slate-900 mb-2"
      >
        {title}
      </h3>
      <p
        data-design-id="error-message"
        className="text-slate-600 text-center max-w-md mb-4"
      >
        {message}
      </p>
      {onRetry && (
        <Button
          onClick={onRetry}
          variant="outline"
          data-design-id="error-retry-button"
          className="inline-flex items-center"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
      )}
    </div>
  );
}