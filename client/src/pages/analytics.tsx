import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { TrendingUp, Activity, FileText, Clock, Target, Zap, CalendarIcon } from "lucide-react";
import { format, subDays, differenceInDays } from "date-fns";

type Analytics = {
  totalNotes: number;
  notesThisWeek: number;
  totalTasks: number;
  tasksCompleted: number;
  tasksPending: number;
  notesThisMonth: number;
  tasksCompletedThisWeek: number;
};

type ProductivityTrend = {
  date: string;
  noteCount: number;
};

type Diagnosis = {
  diagnosis: string;
  count: number;
};

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

export default function Analytics() {
  const { user } = useAuth();
  
  // Date range state - default to last 30 days
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  
  const days = differenceInDays(dateRange.to, dateRange.from) + 1;

  const { data: analytics, isLoading: analyticsLoading } = useQuery<Analytics>({
    queryKey: ["/api/analytics", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const response = await fetch(`/api/analytics?from=${dateRange.from.toISOString()}&to=${dateRange.to.toISOString()}`);
      return response.json();
    },
    enabled: !!user,
  });

  const { data: productivityTrends = [], isLoading: trendsLoading } = useQuery<ProductivityTrend[]>({
    queryKey: ["/api/analytics/productivity", days, dateRange.from.toISOString()],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/productivity?days=${days}&from=${dateRange.from.toISOString()}`);
      return response.json();
    },
    enabled: !!user,
  });

  const { data: diagnoses = [], isLoading: diagnosesLoading } = useQuery<Diagnosis[]>({
    queryKey: ["/api/analytics/diagnoses", dateRange.from.toISOString(), dateRange.to.toISOString()],
    queryFn: async () => {
      const response = await fetch(`/api/analytics/diagnoses?from=${dateRange.from.toISOString()}&to=${dateRange.to.toISOString()}`);
      return response.json();
    },
    enabled: !!user,
  });

  const taskCompletionRate = analytics && analytics.totalTasks > 0
    ? Math.round((analytics.tasksCompleted / analytics.totalTasks) * 100)
    : 0;
  
  const timeSavedHours = Math.round((analytics?.totalNotes || 0) * 0.5);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  return (
    <div className="flex flex-col h-full">
      <header className="border-b bg-background/95 backdrop-blur px-6 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <TrendingUp className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold">Analytics</h1>
              <p className="text-muted-foreground">Track your productivity and insights</p>
            </div>
          </div>
          
          {/* Date Range Picker */}
          <div className="flex items-center gap-2">
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="justify-start text-left font-normal" data-testid="button-date-range">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {format(dateRange.from, "MMM d, yyyy")} - {format(dateRange.to, "MMM d, yyyy")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <div className="p-3 border-b">
                  <div className="flex gap-2 flex-wrap">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setDateRange({ from: subDays(new Date(), 7), to: new Date() });
                        setDatePickerOpen(false);
                      }}
                    >
                      Last 7 days
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setDateRange({ from: subDays(new Date(), 30), to: new Date() });
                        setDatePickerOpen(false);
                      }}
                    >
                      Last 30 days
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        setDateRange({ from: subDays(new Date(), 90), to: new Date() });
                        setDatePickerOpen(false);
                      }}
                    >
                      Last 90 days
                    </Button>
                  </div>
                </div>
                <Calendar
                  mode="range"
                  selected={{ from: dateRange.from, to: dateRange.to }}
                  onSelect={(range) => {
                    if (range?.from && range?.to) {
                      setDateRange({ from: range.from, to: range.to });
                      setDatePickerOpen(false);
                    } else if (range?.from) {
                      setDateRange({ from: range.from, to: range.from });
                    }
                  }}
                  numberOfMonths={2}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto space-y-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card data-testid="card-total-notes">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Notes (Last 30 Days)</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{analytics?.totalNotes || 0}</div>
                    <p className="text-xs text-muted-foreground">
                      {analytics?.notesThisWeek || 0} this week
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-pending-tasks">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Pending Tasks (30 Days)</CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{analytics?.tasksPending || 0}</div>
                    <p className="text-xs text-muted-foreground">
                      {analytics?.tasksCompletedThisWeek || 0} completed this week
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-completion-rate">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Task Completion (30 Days)</CardTitle>
                <Target className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{taskCompletionRate}%</div>
                    <p className="text-xs text-muted-foreground">
                      {analytics?.tasksCompleted || 0} of {analytics?.totalTasks || 0}
                    </p>
                  </>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-time-saved">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Time Saved (30 Days)</CardTitle>
                <Zap className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {analyticsLoading ? (
                  <Skeleton className="h-8 w-16" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">~{timeSavedHours}h</div>
                    <p className="text-xs text-muted-foreground">
                      Est. 30 min per note
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card data-testid="card-productivity-trends">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <Activity className="h-5 w-5 text-primary" />
                  <CardTitle>Productivity Trends</CardTitle>
                </div>
                <CardDescription>Notes created per day over the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                {trendsLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : productivityTrends.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No productivity data yet</p>
                      <p className="text-sm">Create some notes to see trends</p>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={productivityTrends}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        tickFormatter={formatDate}
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        allowDecimals={false}
                      />
                      <Tooltip 
                        labelFormatter={formatDate}
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                        }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="noteCount" 
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                        name="Notes"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card data-testid="card-trending-diagnoses">
              <CardHeader>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <CardTitle>Trending Diagnoses</CardTitle>
                </div>
                <CardDescription>Most common conditions in your notes</CardDescription>
              </CardHeader>
              <CardContent>
                {diagnosesLoading ? (
                  <Skeleton className="h-[300px] w-full" />
                ) : diagnoses.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
                      <p>No diagnosis data yet</p>
                      <p className="text-sm">Complete some SOAP notes to see trends</p>
                    </div>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={diagnoses.slice(0, 8)} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" horizontal={false} />
                      <XAxis 
                        type="number"
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        allowDecimals={false}
                      />
                      <YAxis 
                        dataKey="diagnosis" 
                        type="category"
                        width={120}
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                        tickFormatter={(value) => value.length > 15 ? value.substring(0, 15) + '...' : value}
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                        }}
                      />
                      <Bar dataKey="count" name="Count" radius={[0, 4, 4, 0]}>
                        {diagnoses.slice(0, 8).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card data-testid="card-insights">
            <CardHeader>
              <CardTitle>Insights</CardTitle>
              <CardDescription>Quick summary of your documentation patterns</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-3">
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Most Productive Day</div>
                  <div className="text-lg font-semibold">
                    {productivityTrends.length > 0 
                      ? formatDate(productivityTrends.reduce((max, day) => day.noteCount > max.noteCount ? day : max, productivityTrends[0]).date)
                      : "N/A"
                    }
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Average Notes/Day</div>
                  <div className="text-lg font-semibold">
                    {productivityTrends.length > 0 
                      ? (productivityTrends.reduce((sum, day) => sum + day.noteCount, 0) / productivityTrends.length).toFixed(1)
                      : "0"
                    }
                  </div>
                </div>
                <div className="p-4 border rounded-lg">
                  <div className="text-sm text-muted-foreground mb-1">Top Diagnosis</div>
                  <div className="text-lg font-semibold truncate">
                    {diagnoses.length > 0 ? diagnoses[0].diagnosis : "N/A"}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
