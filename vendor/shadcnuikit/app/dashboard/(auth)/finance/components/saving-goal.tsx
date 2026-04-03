import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export default function SavingGoal() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Saving Goal</CardTitle>
        <CardDescription>75% Progress</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            View Report
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="font-display text-4xl">
            $1052.98
            <span className="text-muted-foreground ml-2 text-sm font-normal">of $1,200</span>
          </div>
          <Progress
            value={75}
            className="h-3"
            indicatorColor="bg-linear-to-r from-chart-1 to-chart-3"
          />
        </div>
      </CardContent>
    </Card>
  );
}
