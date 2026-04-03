"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface StudyProgressProps {
  progress: {
    percentage: number;
    points: Array<{ value: number; reached: boolean }>;
    message: string;
  };
}

export function StudyProgress({ progress }: StudyProgressProps) {
  const { percentage, points, message } = progress;
  const [animatedPercentage, setAnimatedPercentage] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setAnimatedPercentage(percentage);
    }, 100);

    return () => clearTimeout(timer);
  }, [percentage]);

  return (
    <Card className="lg:border-border gap-4 border-transparent lg:gap-6">
      <CardHeader>
        <CardTitle>
          Your Study Progress{" "}
          <Badge variant="outline" className="ms-1">
            {percentage}%
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-primary/20 relative h-2 w-full overflow-hidden rounded-full">
          <motion.div
            className="bg-primary h-full"
            initial={{ width: 0 }}
            animate={{ width: `${animatedPercentage}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
        <div className="flex items-center justify-between">
          {points.map((point, index) => {
            const isReached = percentage >= point.value;
            return (
              <div
                key={index}
                className={`flex size-8 items-center justify-center rounded-full text-xs font-medium ${
                  isReached
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}>
                {point.value}
              </div>
            );
          })}
        </div>
        <div className="bg-muted/50 text-muted-foreground rounded-lg p-3 text-sm">{message}</div>
      </CardContent>
    </Card>
  );
}
