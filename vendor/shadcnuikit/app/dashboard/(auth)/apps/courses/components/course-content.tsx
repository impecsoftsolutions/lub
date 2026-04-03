"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CourseContentProps {
  data: {
    about: string;
    suitFor: string[];
  };
}

export function CourseContent({ data }: CourseContentProps) {
  const { about, suitFor } = data;
  const [isExpanded, setIsExpanded] = useState(false);
  const previewLength = 200;
  const shouldTruncate = about.length > previewLength;
  const displayText = isExpanded || !shouldTruncate ? about : `${about.slice(0, previewLength)}...`;

  return (
    <div className="space-y-6">
      <section>
        <h2 className="mb-3 text-lg font-semibold">About This Course</h2>
        <p className="text-muted-foreground leading-relaxed whitespace-pre-line">{displayText}</p>
        {shouldTruncate && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2"
            onClick={() => setIsExpanded(!isExpanded)}>
            {isExpanded ? "Show less" : "Show more"}
            <ChevronDown
              className={`ml-1 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            />
          </Button>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">This Course Suit For:</h2>
        <ul className="text-muted-foreground space-y-2">
          {suitFor.map((item, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-current" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
