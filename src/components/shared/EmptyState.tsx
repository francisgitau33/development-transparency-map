"use client";

import type { ReactNode } from "react";
import { Inbox } from "lucide-react";

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div
      data-design-id="empty-state"
      className="flex flex-col items-center justify-center py-12 px-4"
    >
      <div
        data-design-id="empty-icon-container"
        className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4"
      >
        {icon || <Inbox className="w-8 h-8 text-slate-400" />}
      </div>
      <h3
        data-design-id="empty-title"
        className="text-lg font-semibold text-slate-900 mb-2"
      >
        {title}
      </h3>
      {description && (
        <p
          data-design-id="empty-description"
          className="text-slate-600 text-center max-w-md mb-4"
        >
          {description}
        </p>
      )}
      {action && (
        <div data-design-id="empty-action">{action}</div>
      )}
    </div>
  );
}