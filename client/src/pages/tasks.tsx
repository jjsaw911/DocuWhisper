import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { 
  Plus, 
  Search,
  Trash2,
  MoreHorizontal,
  FileText,
  ShoppingCart,
  Users,
  MessageSquare,
  ListTodo,
  X,
  ArrowUpDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Task, Note } from "@shared/schema";

const CATEGORIES = [
  { value: "document", label: "Document", icon: FileText, color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  { value: "order", label: "Order", icon: ShoppingCart, color: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20" },
  { value: "coordinate", label: "Coordinate", icon: Users, color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  { value: "communicate", label: "Communicate", icon: MessageSquare, color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
];

function getCategoryInfo(category: string) {
  return CATEGORIES.find((c) => c.value === category) || CATEGORIES[0];
}

function formatRelativeTime(date: Date | string) {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? "s" : ""} ago`;
  if (diffHours < 24) return `about ${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return then.toLocaleDateString();
}

export default function Tasks() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("todo");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskPatient, setNewTaskPatient] = useState("");
  const [newTaskCategory, setNewTaskCategory] = useState<string>("document");

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
    enabled: !!user,
  });

  const { data: notes } = useQuery<Note[]>({
    queryKey: ["/api/notes"],
    enabled: !!user,
  });

  const createMutation = useMutation({
    mutationFn: async (data: { title: string; patientName?: string; category: string }) => {
      return apiRequest("POST", "/api/tasks", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setIsNewTaskOpen(false);
      setNewTaskTitle("");
      setNewTaskPatient("");
      setNewTaskCategory("document");
      toast({
        title: "Task created",
        description: "Your new task has been added",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create task",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return apiRequest("POST", `/api/tasks/${taskId}/complete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: () => {
      toast({
        title: "Failed to complete task",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const uncompleteMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return apiRequest("POST", `/api/tasks/${taskId}/uncomplete`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: () => {
      toast({
        title: "Failed to reopen task",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (taskId: number) => {
      await apiRequest("DELETE", `/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Task deleted",
        description: "The task has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete task",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const filteredTasks = useMemo(() => {
    if (!tasks) return [];
    return tasks.filter((task) => {
      const matchesSearch = !search || 
        task.title.toLowerCase().includes(search.toLowerCase()) ||
        task.patientName?.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || task.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || task.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [tasks, search, statusFilter, categoryFilter]);

  const handleToggleComplete = (task: Task) => {
    if (task.status === "completed") {
      uncompleteMutation.mutate(task.id);
    } else {
      completeMutation.mutate(task.id);
    }
  };

  const handleCreateTask = () => {
    if (!newTaskTitle.trim()) return;
    createMutation.mutate({
      title: newTaskTitle.trim(),
      patientName: newTaskPatient.trim() || undefined,
      category: newTaskCategory,
    });
  };

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("todo");
    setCategoryFilter("all");
  };

  const hasActiveFilters = search || statusFilter !== "todo" || categoryFilter !== "all";

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      <div className="flex-1 overflow-auto">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-6xl">
          <div className="mb-6 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-semibold">Tasks</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Incomplete tasks will be archived after 30 days
              </p>
            </div>
            <Dialog open={isNewTaskOpen} onOpenChange={setIsNewTaskOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-new-task">
                  <Plus className="mr-2 h-4 w-4" />
                  New task
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create new task</DialogTitle>
                  <DialogDescription>
                    Add a clinical task like referrals, orders, or follow-ups.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="task-title">Task title</Label>
                    <Input
                      id="task-title"
                      placeholder="e.g., Refer patient to GI for evaluation"
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      data-testid="input-task-title"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-patient">Patient (optional)</Label>
                    <Input
                      id="task-patient"
                      placeholder="Patient name"
                      value={newTaskPatient}
                      onChange={(e) => setNewTaskPatient(e.target.value)}
                      data-testid="input-task-patient"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="task-category">Category</Label>
                    <Select value={newTaskCategory} onValueChange={setNewTaskCategory}>
                      <SelectTrigger id="task-category" data-testid="select-task-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map((cat) => (
                          <SelectItem key={cat.value} value={cat.value}>
                            <div className="flex items-center gap-2">
                              <cat.icon className="h-4 w-4" />
                              {cat.label}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsNewTaskOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateTask} 
                    disabled={!newTaskTitle.trim() || createMutation.isPending}
                    data-testid="button-create-task"
                  >
                    {createMutation.isPending ? "Creating..." : "Create task"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search for a task or patient"
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                data-testid="input-search"
              />
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[100px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="todo">To Do</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="w-[130px]" data-testid="select-category-filter">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} data-testid="button-reset-filters">
                  <X className="h-4 w-4 mr-1" />
                  Reset filters
                </Button>
              )}
            </div>
          </div>

          {isLoading ? (
            <Card>
              <div className="p-4 space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            </Card>
          ) : filteredTasks.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="-ml-3 h-8">
                        Task title
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="-ml-3 h-8">
                        Patient
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="-ml-3 h-8">
                        Category
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead>
                      <Button variant="ghost" size="sm" className="-ml-3 h-8">
                        Created
                        <ArrowUpDown className="ml-2 h-4 w-4" />
                      </Button>
                    </TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTasks.map((task) => {
                    const categoryInfo = getCategoryInfo(task.category);
                    const CategoryIcon = categoryInfo.icon;
                    return (
                      <TableRow 
                        key={task.id} 
                        className={task.status === "completed" ? "opacity-60" : ""}
                        data-testid={`row-task-${task.id}`}
                      >
                        <TableCell>
                          <Checkbox
                            checked={task.status === "completed"}
                            onCheckedChange={() => handleToggleComplete(task)}
                            disabled={completeMutation.isPending || uncompleteMutation.isPending}
                            data-testid={`checkbox-task-${task.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <span className={task.status === "completed" ? "line-through" : ""}>
                            {task.title}
                          </span>
                        </TableCell>
                        <TableCell>
                          {task.patientName ? (
                            <Badge variant="secondary" className="font-normal">
                              {task.patientName}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${categoryInfo.color} gap-1`}>
                            <CategoryIcon className="h-3 w-3" />
                            {categoryInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {formatRelativeTime(task.createdAt)}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid={`button-task-menu-${task.id}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <DropdownMenuItem 
                                    className="text-destructive"
                                    onSelect={(e) => e.preventDefault()}
                                  >
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    Delete
                                  </DropdownMenuItem>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Delete task?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      This action cannot be undone. This will permanently delete the task.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction
                                      onClick={() => deleteMutation.mutate(task.id)}
                                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    >
                                      Delete
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card className="max-w-md mx-auto" data-testid="card-empty-state">
              <CardContent className="pt-12 pb-12 text-center">
                <ListTodo className="h-16 w-16 mx-auto text-muted-foreground/40 mb-4" />
                <h3 className="text-lg font-semibold mb-2">
                  {hasActiveFilters ? "No tasks found" : "No tasks yet"}
                </h3>
                <p className="text-sm text-muted-foreground mb-6">
                  {hasActiveFilters
                    ? "Try adjusting your filters"
                    : "Create your first task to keep track of clinical follow-ups"}
                </p>
                {!hasActiveFilters && (
                  <Button onClick={() => setIsNewTaskOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    New task
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
