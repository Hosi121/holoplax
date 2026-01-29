"use client";

import { useState } from "react";

export type ExpandableTextProps = {
  text: string;
  maxLength?: number;
  maxLines?: number;
  className?: string;
};

/**
 * Text component that truncates long content and allows expanding
 */
export function ExpandableText({
  text,
  maxLength = 100,
  maxLines,
  className = "",
}: ExpandableTextProps) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const shouldTruncate = text.length > maxLength;
  const displayText = expanded || !shouldTruncate ? text : `${text.slice(0, maxLength)}...`;

  return (
    <span className={className}>
      <span
        className={maxLines && !expanded ? `line-clamp-${maxLines}` : ""}
        style={
          maxLines && !expanded
            ? {
                display: "-webkit-box",
                WebkitLineClamp: maxLines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
            : undefined
        }
      >
        {displayText}
      </span>
      {shouldTruncate && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="ml-1 text-[var(--accent)] hover:underline"
          type="button"
        >
          {expanded ? "閉じる" : "もっと見る"}
        </button>
      )}
    </span>
  );
}
