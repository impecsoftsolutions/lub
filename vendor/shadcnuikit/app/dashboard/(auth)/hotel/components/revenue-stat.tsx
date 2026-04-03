"use client";

import { useState } from "react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis, ReferenceLine } from "recharts";
import { Calendar, TrendingUp } from "lucide-react";

interface RevenueDataItem {
  day: string;
  revenue: number;
  projected: number;
}

interface PeriodData {
  data: RevenueDataItem[];
  total: number;
  percentageChange: number;
}

const items = {
  weekly: {
    data: [
      { day: "Sat", revenue: 2500, projected: 1500 },
      { day: "Sun", revenue: 4500, projected: 2000 },
      { day: "Mon", revenue: 3200, projected: 1800 },
      { day: "Tue", revenue: 6500, projected: 1500 },
      { day: "Wed", revenue: 4200, projected: 1800 },
      { day: "Thu", revenue: 5500, projected: 2000 },
      { day: "Fri", revenue: 3800, projected: 1700 }
    ],
    total: 12480,
    percentageChange: 16
  },
  monthly: {
    data: [
      { day: "Week 1", revenue: 8500, projected: 3500 },
      { day: "Week 2", revenue: 12000, projected: 4000 },
      { day: "Week 3", revenue: 9500, projected: 4500 },
      { day: "Week 4", revenue: 14000, projected: 3000 }
    ],
    total: 59000,
    percentageChange: 22
  },
  yearly: {
    data: [
      { day: "Jan", revenue: 28000, projected: 12000 },
      { day: "Feb", revenue: 32000, projected: 10000 },
      { day: "Mar", revenue: 38000, projected: 14000 },
      { day: "Apr", revenue: 30000, projected: 15000 },
      { day: "May", revenue: 42000, projected: 10000 },
      { day: "Jun", revenue: 45000, projected: 12000 },
      { day: "Jul", revenue: 40000, projected: 16000 },
      { day: "Aug", revenue: 44000, projected: 14000 },
      { day: "Sep", revenue: 48000, projected: 10000 },
      { day: "Oct", revenue: 38000, projected: 18000 },
      { day: "Nov", revenue: 52000, projected: 12000 },
      { day: "Dec", revenue: 58000, projected: 15000 }
    ],
    total: 643000,
    percentageChange: 35
  },
  selectedPeriod: "weekly"
};

const chartConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--color-chart-1)"
  },
  projected: {
    label: "Projected",
    color: "#d1d5db"
  }
} satisfies ChartConfig;

const formatYAxisTick = (value: number) => {
  if (value === 0) return "0";
  if (value >= 1000000) return `${value / 1000000}M`;
  if (value >= 1000) return `${value / 1000}K`;
  return value.toString();
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2
  }).format(value);
};

const StripePattern = () => (
  <pattern
    id="stripePattern"
    patternUnits="userSpaceOnUse"
    width="8"
    height="8"
    patternTransform="rotate(-45)">
    <rect width="8" height="8" fill="var(--muted)" />
    <rect width="4" height="8" fill="var(--background)" />
  </pattern>
);

const getYAxisConfig = (period: string) => {
  switch (period) {
    case "yearly":
      return { ticks: [0, 20000, 40000, 60000, 80000], domain: [0, 80000], refLine: 50000 };
    case "monthly":
      return { ticks: [0, 5000, 10000, 15000, 20000], domain: [0, 20000], refLine: 12000 };
    default:
      return { ticks: [0, 2000, 4000, 6000, 8000, 10000], domain: [0, 10000], refLine: 6000 };
  }
};

export function RevenueStat() {
  const [selectedPeriod, setSelectedPeriod] = useState(items.selectedPeriod);

  const currentData = items[selectedPeriod as keyof typeof items] as PeriodData;
  const { data, total, percentageChange } = currentData;
  const yAxisConfig = getYAxisConfig(selectedPeriod);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Revenue Stat</CardTitle>
        <CardAction>
          <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
            <SelectTrigger>
              <Calendar />
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="weekly">Weekly</SelectItem>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="yearly">Yearly</SelectItem>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-col items-baseline justify-between lg:flex-row">
          <span className="text-2xl font-semibold tracking-tight lg:text-3xl">
            {formatCurrency(total)}
          </span>
          <div className="flex items-center gap-1 text-sm">
            <TrendingUp className="size-4 text-green-600" />
            <span className="text-success font-medium">{percentageChange}%</span>
            <span className="text-muted-foreground">from last month</span>
          </div>
        </div>

        <ChartContainer config={chartConfig} className="h-[240px] w-full">
          <BarChart data={data} margin={{ top: 20, right: 0, left: -30, bottom: 0 }}>
            <defs>
              <StripePattern />
            </defs>
            <XAxis
              dataKey="day"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)" }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)" }}
              tickFormatter={formatYAxisTick}
              ticks={yAxisConfig.ticks}
              domain={yAxisConfig.domain}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => `${value} 2026`}
                  formatter={(value, name) => (
                    <div className="flex items-center gap-2">
                      <div
                        className="h-2.5 w-2.5 rounded-full"
                        style={{
                          backgroundColor: name === "revenue" ? "hsl(142 71% 45%)" : "#d1d5db"
                        }}
                      />
                      <span className="text-muted-foreground capitalize">
                        {name === "revenue" ? "Revenue" : "Projected"}:
                      </span>
                      <span className="font-medium">{formatCurrency(Number(value))}</span>
                    </div>
                  )}
                />
              }
            />
            <Bar
              dataKey="revenue"
              stackId="stack"
              radius={[0, 0, 4, 4]}
              fill="var(--color-revenue)"
            />
            <Bar
              dataKey="projected"
              stackId="stack"
              radius={[4, 4, 0, 0]}
              fill="url(#stripePattern)"
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
