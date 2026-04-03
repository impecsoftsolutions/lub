"use client";

import { TrendingUpIcon } from "lucide-react";
import { Bar, BarChart, XAxis } from "recharts";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart";

const chartData = [
  { month: "January", expenses: 80 },
  { month: "February", expenses: 200 },
  { month: "March", expenses: 120 },
  { month: "April", expenses: 190 },
  { month: "May", expenses: 130 },
  { month: "June", expenses: 140 }
];

const chartConfig = {
  expenses: {
    label: "Expenses",
    color: "var(--chart-1)"
  }
} satisfies ChartConfig;

export default function MonthlyExpenses() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Monthly Expenses</CardTitle>
        <CardDescription>Last 6 months</CardDescription>
        <CardAction>
          <Button variant="outline" size="sm">
            View Report
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[220px] w-full lg:h-[320px]">
          <BarChart accessibilityLayer data={chartData}>
            <XAxis
              dataKey="month"
              tickLine={false}
              tickMargin={10}
              axisLine={false}
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <Bar dataKey="expenses" stackId="a" fill="var(--color-expenses)" radius={10} />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="flex gap-2 leading-none font-medium">
          Trending up by 5.2% this month <TrendingUpIcon className="size-4 text-green-600" />
        </div>
        <div className="text-muted-foreground leading-none">
          Showing data from the last 6 months
        </div>
      </CardFooter>
    </Card>
  );
}
