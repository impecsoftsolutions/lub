import { Check, Play, Pause } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface Module {
  id: number;
  title: string;
  duration: string;
  completed: boolean;
  current: boolean;
}

interface CourseModulesProps {
  data: {
    modules: Module[];
    completedCount: number;
    totalCount: number;
  };
}

export function CourseModules({ data }: CourseModulesProps) {
  const { modules, completedCount, totalCount } = data;
  return (
    <Card className="lg:border-border gap-4 border-transparent lg:gap-6">
      <CardHeader>
        <CardTitle>Course Completion</CardTitle>
        <CardAction>
          <span className="text-muted-foreground text-sm">
            {completedCount}/{totalCount}
          </span>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {modules.map((module) => (
            <div
              key={module.id}
              className={cn(
                "flex items-center gap-3 rounded-lg border p-3 transition-colors",
                module.current && "border-primary bg-primary/5",
                !module.current && "border-border"
              )}>
              {module.completed ? (
                <div className="flex size-8 items-center justify-center rounded-full bg-green-500 text-white">
                  <Check className="size-4" />
                </div>
              ) : module.current ? (
                <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-full">
                  <Pause className="size-4" />
                </div>
              ) : (
                <div className="bg-muted flex size-8 items-center justify-center rounded-full">
                  <Play className="size-4" />
                </div>
              )}
              <div className="flex-1">
                <p className="font-medium">{module.title}</p>
                <p className="text-muted-foreground text-sm">{module.duration}</p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
