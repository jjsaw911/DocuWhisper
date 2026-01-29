import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ThemeToggle } from "@/components/theme-toggle";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Stethoscope,
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  FileText,
  Star,
  X,
  Check,
  Globe,
  Copy
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
} from "@/components/ui/alert-dialog";

type Template = {
  id: number;
  userId: string;
  name: string;
  description: string | null;
  prompt: string;
  isDefault: boolean | null;
  isPublic: boolean | null;
  sharedWith: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export default function Templates() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [deleteTemplate, setDeleteTemplate] = useState<Template | null>(null);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    prompt: "",
    isDefault: false,
    isPublic: false,
  });
  
  const [activeTab, setActiveTab] = useState<"my" | "public">("my");

  const { data: templates = [], isLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates"],
  });
  
  const { data: publicTemplates = [], isLoading: publicLoading } = useQuery<Template[]>({
    queryKey: ["/api/templates/public"],
    enabled: activeTab === "public",
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const response = await apiRequest("POST", "/api/templates", data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates/public"] });
      setIsCreateOpen(false);
      resetForm();
      toast({
        title: "Template created",
        description: "Your template has been saved",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create template",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof formData }) => {
      const response = await apiRequest("PATCH", `/api/templates/${id}`, data);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates/public"] });
      setEditingTemplate(null);
      resetForm();
      toast({
        title: "Template updated",
        description: "Your changes have been saved",
      });
    },
    onError: () => {
      toast({
        title: "Failed to update template",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      queryClient.invalidateQueries({ queryKey: ["/api/templates/public"] });
      setDeleteTemplate(null);
      toast({
        title: "Template deleted",
        description: "The template has been removed",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete template",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });
  
  const cloneMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("POST", `/api/templates/${id}/clone`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/templates"] });
      setActiveTab("my");
      toast({
        title: "Template cloned",
        description: "The template has been added to your collection",
      });
    },
    onError: () => {
      toast({
        title: "Failed to clone template",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFormData({
      name: "",
      description: "",
      prompt: "",
      isDefault: false,
      isPublic: false,
    });
  };

  const openEditDialog = (template: Template) => {
    setFormData({
      name: template.name,
      description: template.description || "",
      prompt: template.prompt,
      isDefault: template.isDefault || false,
      isPublic: template.isPublic || false,
    });
    setEditingTemplate(template);
  };

  const handleSubmit = () => {
    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const closeDialog = () => {
    setIsCreateOpen(false);
    setEditingTemplate(null);
    resetForm();
  };

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">SOAP Note Templates</h1>
            <p className="text-muted-foreground">Create and manage your custom templates for generating SOAP notes</p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)} data-testid="button-create-template">
            <Plus className="mr-2 h-4 w-4" />
            New Template
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "my" | "public")} className="mb-6">
          <TabsList>
            <TabsTrigger value="my" data-testid="tab-my-templates">
              <FileText className="h-4 w-4 mr-2" />
              My Templates
            </TabsTrigger>
            <TabsTrigger value="public" data-testid="tab-public-templates">
              <Globe className="h-4 w-4 mr-2" />
              Public Templates
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="my" className="mt-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : templates.length === 0 ? (
              <Card data-testid="card-empty-state">
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No templates yet</h3>
                  <p className="text-muted-foreground text-center mb-4">
                    Create your first template to customize how SOAP notes are generated
                  </p>
                  <Button onClick={() => setIsCreateOpen(true)}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Template
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {templates.map((template) => (
                  <Card key={template.id} data-testid={`card-template-${template.id}`}>
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                          {template.isDefault && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                              <Star className="h-3 w-3" />
                              Default
                            </span>
                          )}
                          {template.isPublic && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400">
                              <Globe className="h-3 w-3" />
                              Public
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <CardDescription className="mt-1">{template.description}</CardDescription>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(template)}
                          data-testid={`button-edit-${template.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeleteTemplate(template)}
                          data-testid={`button-delete-${template.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                        {template.prompt}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="public" className="mt-4">
            {publicLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : publicTemplates.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-12">
                  <Globe className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No public templates available</h3>
                  <p className="text-muted-foreground text-center">
                    When users share templates publicly, they'll appear here
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {publicTemplates.map((template) => (
                  <Card key={template.id} data-testid={`card-public-template-${template.id}`}>
                    <CardHeader className="flex flex-row items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CardTitle className="text-lg">{template.name}</CardTitle>
                        </div>
                        {template.description && (
                          <CardDescription className="mt-1">{template.description}</CardDescription>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => cloneMutation.mutate(template.id)}
                        disabled={cloneMutation.isPending}
                        data-testid={`button-clone-${template.id}`}
                      >
                        {cloneMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Copy className="h-4 w-4 mr-2" />
                            Clone
                          </>
                        )}
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-3 whitespace-pre-wrap">
                        {template.prompt}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={isCreateOpen || !!editingTemplate} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create Template"}</DialogTitle>
            <DialogDescription>
              Define a custom prompt that will be used when generating SOAP notes
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name</Label>
              <Input
                id="name"
                placeholder="e.g., Detailed Physical Exam"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                data-testid="input-template-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (Optional)</Label>
              <Input
                id="description"
                placeholder="Brief description of when to use this template"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                data-testid="input-template-description"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prompt">AI Prompt</Label>
              <Textarea
                id="prompt"
                placeholder="Enter the instructions for the AI when generating SOAP notes..."
                value={formData.prompt}
                onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
                className="min-h-[200px]"
                data-testid="textarea-template-prompt"
              />
              <p className="text-xs text-muted-foreground">
                This prompt will replace the default instructions when generating SOAP notes. 
                Be specific about the format and style you want.
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData({ ...formData, isDefault: checked })}
                data-testid="switch-template-default"
              />
              <Label htmlFor="isDefault">Set as default template</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="isPublic"
                checked={formData.isPublic}
                onCheckedChange={(checked) => setFormData({ ...formData, isPublic: checked })}
                data-testid="switch-template-public"
              />
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-muted-foreground" />
                <Label htmlFor="isPublic">Share publicly</Label>
              </div>
            </div>
            {formData.isPublic && (
              <p className="text-xs text-muted-foreground">
                This template will be visible to all users in the Public Templates section. 
                Others can clone it to their own collection.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!formData.name || !formData.prompt || createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-template"
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              {editingTemplate ? "Save Changes" : "Create Template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTemplate} onOpenChange={(open) => !open && setDeleteTemplate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Template</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteTemplate?.name}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTemplate && deleteMutation.mutate(deleteTemplate.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Delete"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
