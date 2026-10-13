import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, AlertCircle, BarChart3, Lock, X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  useAiUsageDaily,
  useAiUsageList,
} from "@/api/endpoints/ai-usage/ai-usage";
import type { AiUsageRow } from "@/api/model";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getApiErrorMessage } from "@/lib/api-error";
import { diffUtcDays, subtractUtcDays, todayUtcDateString } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS = [7, 14, 30, 90] as const;
const MAX_DAYS = 90;
const PAGE_SIZE = 50;

const dailyChartConfig: ChartConfig = {
  successful: {
    label: "Successful / other",
    color: "#4f46e5",
  },
  rate_limited: {
    label: "Rate limited",
    color: "#d97706",
  },
  failures: {
    label: "Failures (error / timeout)",
    color: "#dc2626",
  },
};

export const Route = createFileRoute("/_main/ai-usage")({
  component: AiUsagePage,
});

function formatRate(failures: number, calls: number): string {
  if (calls <= 0) {
    return "0.0%";
  }
  return `${((failures / calls) * 100).toFixed(1)}%`;
}

function formatLatency(value: number | null): string {
  if (value === null || value === undefined) {
    return "—";
  }
  return `${Math.round(value).toLocaleString()} ms`;
}

function AiUsagePage() {
  const initialTo = useMemo(() => todayUtcDateString(), []);
  const initialFrom = useMemo(
    () => subtractUtcDays(initialTo, 30),
    [initialTo]
  );

  const [activePreset, setActivePreset] = useState<number | null>(30);
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);
  const [page, setPage] = useState(0);
  const [selectedOrg, setSelectedOrg] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const rangeValidationError = useMemo(() => {
    if (!fromDate || !toDate) {
      return "Please select both From and To dates.";
    }
    const diff = diffUtcDays(fromDate, toDate);
    if (diff === null) {
      return "Invalid date format. Use YYYY-MM-DD.";
    }
    if (diff < 0) {
      return "Start date (From) must be on or before end date (To).";
    }
    if (diff > MAX_DAYS) {
      return `Date range cannot exceed ${MAX_DAYS} days (currently ${diff} days).`;
    }
    return null;
  }, [fromDate, toDate]);

  const isRangeValid = rangeValidationError === null;
  const offset = page * PAGE_SIZE;

  const { data, isLoading, isError, error } = useAiUsageList(
    {
      from: fromDate,
      to: toDate,
      limit: PAGE_SIZE,
      offset,
    },
    {
      query: {
        enabled: isRangeValid,
      },
    }
  );

  const items: AiUsageRow[] = data?.items ?? [];
  const total = data?.total ?? 0;
  const showingFrom = total === 0 ? 0 : offset + 1;
  const showingTo = offset + items.length;
  const canPrev = page > 0;
  const canNext = showingTo < total;

  const totals = useMemo(() => {
    const list = data?.items ?? [];
    let calls = 0;
    let failures = 0;
    let rateLimited = 0;
    for (const row of list) {
      calls += row.calls;
      failures += row.failures;
      rateLimited += row.rate_limited;
    }
    return {
      calls,
      failures,
      rateLimited,
      failureRate: formatRate(failures, calls),
    };
  }, [data?.items]);

  const handleSelectPreset = (days: number) => {
    const today = todayUtcDateString();
    setToDate(today);
    setFromDate(subtractUtcDays(today, days));
    setActivePreset(days);
    setPage(0);
  };

  const handleFromChange = (value: string) => {
    setFromDate(value);
    setActivePreset(null);
    setPage(0);
  };

  const handleToChange = (value: string) => {
    setToDate(value);
    setActivePreset(null);
    setPage(0);
  };

  const dailyQuery = useAiUsageDaily(
    selectedOrg?.id ?? "",
    {
      from: fromDate,
      to: toDate,
    },
    {
      query: {
        enabled: Boolean(selectedOrg?.id) && isRangeValid,
      },
    }
  );

  const dailySeries = useMemo(() => {
    const days = dailyQuery.data?.days ?? [];
    return days.map((d) => ({
      date: d.date,
      shortDate: d.date.slice(5),
      calls: d.calls,
      failures: d.failures,
      rate_limited: d.rate_limited,
      successful: Math.max(0, d.calls - d.failures - d.rate_limited),
    }));
  }, [dailyQuery.data?.days]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI usage</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Per-organization AI call volume, failure rates, latency, and token
          counts. Prompts and outputs are never stored.
        </p>
      </div>

      {/* Date range controls */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Preset window
              </span>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((days) => (
                  <Button
                    key={days}
                    type="button"
                    variant={activePreset === days ? "default" : "outline"}
                    size="sm"
                    onClick={() => handleSelectPreset(days)}
                  >
                    Last {days} days
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ai-usage-from">From (UTC)</Label>
                <Input
                  id="ai-usage-from"
                  type="date"
                  value={fromDate}
                  max={toDate || undefined}
                  onChange={(e) => handleFromChange(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ai-usage-to">To (UTC)</Label>
                <Input
                  id="ai-usage-to"
                  type="date"
                  value={toDate}
                  min={fromDate || undefined}
                  onChange={(e) => handleToChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          {rangeValidationError && (
            <div
              role="alert"
              className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{rangeValidationError}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Totals strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total calls</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {isLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                totals.calls.toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failures (error / timeout)</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-destructive">
              {isLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                totals.failures.toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Rate limited</CardDescription>
            <CardTitle className="text-2xl tabular-nums text-amber-600 dark:text-amber-400">
              {isLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                totals.rateLimited.toLocaleString()
              )}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Failure rate</CardDescription>
            <CardTitle className="text-2xl tabular-nums">
              {isLoading ? (
                <Skeleton className="h-7 w-16" />
              ) : (
                totals.failureRate
              )}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Per-organization table */}
      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Failures</TableHead>
                <TableHead className="text-right">Rate limited</TableHead>
                <TableHead className="text-right">Failure rate</TableHead>
                <TableHead className="text-right">p50 latency</TableHead>
                <TableHead className="text-right">Avg latency</TableHead>
                <TableHead className="text-right">Input tokens</TableHead>
                <TableHead className="text-right">Output tokens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 9 }).map((__, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-16" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}

              {!isLoading && isError && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="py-10 text-center text-sm text-destructive"
                  >
                    {getApiErrorMessage(
                      error,
                      "Failed to load AI usage metrics."
                    )}
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && !isError && items.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Activity className="size-6" />
                      <p className="text-sm font-medium text-foreground">
                        No AI calls in this period
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading &&
                !isError &&
                items.map((row) => {
                  const isSelected = selectedOrg?.id === row.org_id;
                  return (
                    <TableRow
                      key={row.org_id}
                      tabIndex={0}
                      aria-selected={isSelected}
                      className={cn(
                        "cursor-pointer hover:bg-muted/60",
                        isSelected && "bg-primary/5"
                      )}
                      onClick={() =>
                        setSelectedOrg({
                          id: row.org_id,
                          name: row.org_name,
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedOrg({
                            id: row.org_id,
                            name: row.org_name,
                          });
                        }
                      }}
                    >
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{row.org_name}</span>
                          {isSelected && (
                            <Badge variant="secondary" className="text-[10px]">
                              Viewing daily
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.calls.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.failures > 0 ? (
                          <span className="font-medium text-destructive">
                            {row.failures.toLocaleString()}
                          </span>
                        ) : (
                          "0"
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.rate_limited > 0 ? (
                          <span className="font-medium text-amber-600 dark:text-amber-400">
                            {row.rate_limited.toLocaleString()}
                          </span>
                        ) : (
                          "0"
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatRate(row.failures, row.calls)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatLatency(row.p50_latency_ms)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatLatency(row.avg_latency_ms)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.input_tokens.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {row.output_tokens.toLocaleString()}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-col gap-3 border-t px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "No organizations with AI calls in this range"
              : `Showing ${showingFrom}–${showingTo} of ${total} organizations (click a row to inspect daily series)`}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!canPrev || isLoading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!canNext || isLoading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>

      {/* Daily series panel for selected organization */}
      {selectedOrg && (
        <Card id="daily-series-panel">
          <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="size-5 text-primary" />
                <CardTitle className="text-lg">
                  Daily AI usage — {selectedOrg.name}
                </CardTitle>
              </div>
              <CardDescription>
                {fromDate} to {toDate} (UTC). Stacked by outcome.{" "}
                <Link
                  to="/orgs/$orgId"
                  params={{ orgId: selectedOrg.id }}
                  className="underline underline-offset-4 hover:text-foreground"
                >
                  View organization
                </Link>
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedOrg(null)}
              aria-label="Close daily usage panel"
            >
              <X className="size-4" />
              Close
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            {dailyQuery.isLoading && <Skeleton className="h-64 w-full" />}

            {!dailyQuery.isLoading && dailyQuery.isError && (
              <p className="text-sm text-destructive">
                {getApiErrorMessage(
                  dailyQuery.error,
                  "Failed to load daily series."
                )}
              </p>
            )}

            {!dailyQuery.isLoading && !dailyQuery.isError && (
              <>
                <ChartContainer
                  config={dailyChartConfig}
                  className="h-64 w-full aspect-auto"
                >
                  <BarChart
                    data={dailySeries}
                    margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="shortDate"
                      tickLine={false}
                      axisLine={false}
                      tickMargin={8}
                    />
                    <YAxis
                      allowDecimals={false}
                      tickLine={false}
                      axisLine={false}
                      width={32}
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar
                      dataKey="successful"
                      stackId="calls"
                      fill="var(--color-successful)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="rate_limited"
                      stackId="calls"
                      fill="var(--color-rate_limited)"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="failures"
                      stackId="calls"
                      fill="var(--color-failures)"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ChartContainer>

                {/* Accessible text alternative table underneath */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                    Daily breakdown table ({selectedOrg.name})
                  </h3>
                  <div className="max-h-60 overflow-y-auto rounded-lg border">
                    <Table
                      aria-label={`Daily AI usage breakdown for ${selectedOrg.name}`}
                    >
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date (UTC)</TableHead>
                          <TableHead className="text-right">Calls</TableHead>
                          <TableHead className="text-right">Failures</TableHead>
                          <TableHead className="text-right">
                            Rate limited
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dailySeries.map((day) => (
                          <TableRow key={day.date}>
                            <TableCell className="font-mono text-xs">
                              {day.date}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {day.calls.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {day.failures.toLocaleString()}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {day.rate_limited.toLocaleString()}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex items-center gap-2.5 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        <Lock className="size-4 shrink-0 text-muted-foreground" />
        <p>
          AI telemetry records only status, latency, and token counts. Prompt
          and plan text is never stored.
        </p>
      </div>
    </div>
  );
}
