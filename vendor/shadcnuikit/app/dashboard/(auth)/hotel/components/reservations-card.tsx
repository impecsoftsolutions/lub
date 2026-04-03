"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartConfig,
  ChartTooltip,
  ChartTooltipContent
} from "@/components/ui/chart";
import { PieChart, Pie, Label } from "recharts";
import React from "react";

const data = {
  totalSales: 86000,
  salesData: [
    [
      { month: "January", value: 186 },
      { month: "February", value: 305 },
      { month: "March", value: 237 },
      { month: "April", value: 73 },
      { month: "May", value: 209 },
      { month: "June", value: 214 }
    ]
  ]
};

const chartData = [
  { name: "confirmed", value: 180, fill: "var(--color-confirmed)" },
  { name: "checkedIn", value: 120, fill: "var(--color-checkedIn)" },
  { name: "checkedOut", value: 62, fill: "var(--color-checkedOut)" }
];

const chartConfig = {
  confirmed: {
    label: "Confirmed",
    color: "var(--chart-1)"
  },
  checkedIn: {
    label: "Checked In",
    color: "var(--chart-2)"
  },
  checkedOut: {
    label: "Checked Out",
    color: "var(--chart-4)"
  }
} satisfies ChartConfig;

export function ReservationsCard() {
  const total = React.useMemo(() => {
    return chartData.reduce((acc, curr) => acc + curr.value, 0);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reservations</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col items-center gap-6 lg:flex-row">
          <div className="relative flex-shrink-0">
            <ChartContainer config={chartConfig} className="aspect-square h-[250px]">
              <PieChart>
                <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
                <Pie data={chartData} dataKey="value" nameKey="name" innerRadius={60}>
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
                              className="fill-foreground text-2xl font-semibold lg:text-3xl">
                              {total.toLocaleString()}
                            </tspan>
                            <tspan
                              x={viewBox.cx}
                              y={(viewBox.cy || 0) + 24}
                              className="fill-muted-foreground">
                              Reservations
                            </tspan>
                          </text>
                        );
                      }
                    }}
                  />
                </Pie>
              </PieChart>
            </ChartContainer>
          </div>

          <div className="flex flex-row gap-3 lg:flex-col">
            {(Object.keys(chartConfig) as Array<keyof typeof chartConfig>).map((item) => (
              <div key={chartConfig[item]?.label} className="flex items-center gap-3">
                <div
                  className={`size-2 shrink-0 rounded-full`}
                  style={{ backgroundColor: chartConfig[item].color }}
                />
                <span className="text-xs">{chartConfig[item].label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 text-center lg:mt-0">
          <p className="text-2xl font-semibold lg:text-3xl">${data.totalSales.toLocaleString()}</p>
          <p className="text-muted-foreground mt-1 text-sm">Total Sales This Week</p>
        </div>
      </CardContent>
    </Card>
  );
}
