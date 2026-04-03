"use client";

import { Label, PolarGrid, PolarRadiusAxis, RadialBar, RadialBarChart } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartConfig, ChartContainer } from "@/components/ui/chart";

const macros = [
  { label: "Carbs", amount: "178g", color: "bg-red-400" },
  { label: "Protein", amount: "92g", color: "bg-blue-400" },
  { label: "Fats", amount: "38g", color: "bg-yellow-400" }
];

const chartData = [{ browser: "safari", visitors: 1300, fill: "var(--color-safari)" }];

const chartConfig = {
  visitors: {
    label: "Visitors"
  },
  safari: {
    label: "Safari",
    color: "var(--chart-1)"
  }
} satisfies ChartConfig;

export function NutritionCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Nutrition</CardTitle>
        <CardDescription>Today&#39;s intake</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ChartContainer config={chartConfig} className="mx-auto aspect-square h-44 w-full">
          <RadialBarChart
            data={chartData}
            startAngle={0}
            endAngle={300}
            innerRadius={80}
            outerRadius={110}>
            <PolarGrid
              gridType="circle"
              radialLines={false}
              stroke="none"
              className="first:fill-muted last:fill-background"
              polarRadius={[86, 74]}
            />
            <RadialBar dataKey="visitors" background cornerRadius={10} />
            <PolarRadiusAxis tick={false} tickLine={false} axisLine={false}>
              <Label
                content={({ viewBox }) => {
                  if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                    return (
                      <text
                        x={viewBox.cx}
                        y={viewBox.cy}
                        textAnchor="middle"
                        dominantBaseline="middle">
                        <tspan
                          x={viewBox.cx}
                          y={viewBox.cy}
                          className="fill-foreground text-4xl font-bold">
                          {chartData[0].visitors.toLocaleString()}
                        </tspan>
                        <tspan
                          x={viewBox.cx}
                          y={(viewBox.cy || 0) + 24}
                          className="fill-muted-foreground">
                          kcal
                        </tspan>
                      </text>
                    );
                  }
                }}
              />
            </PolarRadiusAxis>
          </RadialBarChart>
        </ChartContainer>
        <p className="text-muted-foreground text-center text-sm">680 kcal remaining</p>
        <div className="grid grid-cols-3 gap-3">
          {macros.map((macro) => (
            <div key={macro.label} className="bg-muted rounded-xl p-4 text-center">
              <div className={`h-1 w-8 ${macro.color} mx-auto mb-2 rounded-full`} />
              <p className="text-muted-foreground mb-1 text-xs">{macro.label}</p>
              <p className="text-lg font-bold">{macro.amount}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
