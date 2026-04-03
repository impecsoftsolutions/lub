import { Card, CardAction, CardDescription, CardHeader } from "@/components/ui/card";
import CountAnimation from "@/components/ui/custom/count-animation";
import { Badge } from "@/components/ui/badge";

export default function FailedConversionsCard() {
  return (
    <Card>
      <CardHeader>
        <CardDescription>Failed conversions</CardDescription>
        <CardAction>
          <Badge variant="destructive">-0.3%</Badge>
        </CardAction>
        <div className="font-display text-3xl">
          <CountAnimation number={23} />
        </div>
        <div className="text-muted-foreground text-sm">More than last month</div>
      </CardHeader>
    </Card>
  );
}
