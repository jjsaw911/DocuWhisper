import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { useState } from "react";
import { 
  ArrowLeft,
  Users,
  Gift,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Copy,
  Check,
  Loader2,
  Crown,
  Shield,
  Mail,
  Send
} from "lucide-react";

interface Subscription {
  id: number;
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status: string;
  currentPeriodEnd?: string;
  createdAt: string;
  updatedAt: string;
}

interface Invite {
  id: number;
  code: string;
  membershipType: string;
  emailSentTo?: string;
  usedBy?: string;
  usedAt?: string;
  createdAt: string;
  expiresAt?: string;
}

interface AdminCheckData {
  isAdmin: boolean;
}

const MEMBERSHIP_TYPES = [
  { value: "trial_7", label: "7-Day Trial" },
  { value: "trial_14", label: "14-Day Trial" },
  { value: "trial_30", label: "30-Day Trial" },
  { value: "months_1", label: "1 Month Free" },
  { value: "months_3", label: "3 Months Free" },
  { value: "months_6", label: "6 Months Free" },
  { value: "months_12", label: "1 Year Free" },
  { value: "lifetime", label: "Lifetime Access" },
];

const EXTENSION_TYPES = [
  { value: "days_7", label: "+7 Days" },
  { value: "days_14", label: "+14 Days" },
  { value: "days_30", label: "+30 Days" },
  { value: "months_3", label: "+3 Months" },
  { value: "months_6", label: "+6 Months" },
  { value: "months_12", label: "+1 Year" },
  { value: "lifetime", label: "Lifetime" },
];

export default function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [newInviteType, setNewInviteType] = useState("trial_30");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [selectedExtension, setSelectedExtension] = useState<{ [key: string]: string }>({});
  const [emailInviteEmail, setEmailInviteEmail] = useState("");
  const [emailInviteType, setEmailInviteType] = useState("trial_30");
  const [emailInviteName, setEmailInviteName] = useState("");

  const { data: adminCheck, isLoading: adminLoading } = useQuery<AdminCheckData>({
    queryKey: ["/api/admin/check"],
    enabled: !!user,
  });

  const { data: subscribers, isLoading: subLoading } = useQuery<Subscription[]>({
    queryKey: ["/api/admin/subscribers"],
    enabled: !!user && adminCheck?.isAdmin === true,
  });

  const { data: invites, isLoading: invitesLoading } = useQuery<Invite[]>({
    queryKey: ["/api/admin/invites"],
    enabled: !!user && adminCheck?.isAdmin === true,
  });

  const createInviteMutation = useMutation({
    mutationFn: async (membershipType: string) => {
      const response = await apiRequest("POST", "/api/admin/invites", { membershipType });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({
        title: "Invite created",
        description: "New invite code has been generated",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create invite",
        description: "Please try again",
        variant: "destructive",
      });
    },
  });

  const deleteInviteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/invites/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      toast({
        title: "Invite deleted",
      });
    },
    onError: () => {
      toast({
        title: "Failed to delete invite",
        variant: "destructive",
      });
    },
  });

  const extendSubscriptionMutation = useMutation({
    mutationFn: async ({ userId, extensionType }: { userId: string; extensionType: string }) => {
      const response = await apiRequest("POST", "/api/admin/extend-subscription", { userId, extensionType });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscribers"] });
      toast({
        title: "Subscription extended",
        description: "The user's subscription has been updated",
      });
    },
    onError: () => {
      toast({
        title: "Failed to extend subscription",
        variant: "destructive",
      });
    },
  });

  const sendEmailInviteMutation = useMutation({
    mutationFn: async ({ email, membershipType, patientName }: { email: string; membershipType: string; patientName?: string }) => {
      const response = await apiRequest("POST", "/api/admin/send-invite", { email, membershipType, patientName });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/invites"] });
      setEmailInviteEmail("");
      setEmailInviteName("");
      toast({
        title: "Invitation sent!",
        description: data.message,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to send invitation",
        description: error.message || "Please check your email service configuration",
        variant: "destructive",
      });
    },
  });

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch {
      toast({
        title: "Failed to copy",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleDateString();
  };

  const getMembershipLabel = (type: string) => {
    return MEMBERSHIP_TYPES.find(t => t.value === type)?.label || type;
  };

  const isLifetime = (periodEnd?: string) => {
    if (!periodEnd) return false;
    return new Date(periodEnd).getFullYear() > new Date().getFullYear() + 50;
  };

  if (adminLoading) {
    return (
      <div className="h-full overflow-auto bg-background p-6">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-10 w-64 mb-4" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!adminCheck?.isAdmin) {
    return (
      <div className="h-full bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
            <p className="text-sm text-muted-foreground mb-4">
              You don't have permission to access the admin dashboard.
            </p>
            <Button asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-background">
      <div className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex h-14 items-center gap-4 px-6">
          <Button variant="ghost" size="icon" asChild data-testid="button-back">
            <Link href="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <span className="text-lg font-semibold">Admin Dashboard</span>
          </div>
        </div>
      </div>

      <div className="p-6 max-w-6xl mx-auto">
        <Tabs defaultValue="email-invites" className="space-y-6">
          <TabsList>
            <TabsTrigger value="email-invites" data-testid="tab-email-invites">
              <Mail className="mr-2 h-4 w-4" />
              Email Invites
            </TabsTrigger>
            <TabsTrigger value="subscribers" data-testid="tab-subscribers">
              <Users className="mr-2 h-4 w-4" />
              Subscribers
            </TabsTrigger>
            <TabsTrigger value="invites" data-testid="tab-invites">
              <Gift className="mr-2 h-4 w-4" />
              Invite Codes
            </TabsTrigger>
          </TabsList>

          <TabsContent value="email-invites" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="h-5 w-5" />
                  Send Email Invitation
                </CardTitle>
                <CardDescription>
                  Send an invite link directly to a clinician's email address. They'll receive a link to sign up and activate their membership.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="clinician-email">Clinician Email *</Label>
                    <Input
                      id="clinician-email"
                      type="email"
                      placeholder="doctor@example.com"
                      value={emailInviteEmail}
                      onChange={(e) => setEmailInviteEmail(e.target.value)}
                      data-testid="input-clinician-email"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="clinician-name">Clinician Name (optional)</Label>
                    <Input
                      id="clinician-name"
                      type="text"
                      placeholder="Dr. Smith"
                      value={emailInviteName}
                      onChange={(e) => setEmailInviteName(e.target.value)}
                      data-testid="input-clinician-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Membership Type</Label>
                    <Select value={emailInviteType} onValueChange={setEmailInviteType}>
                      <SelectTrigger data-testid="select-email-invite-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMBERSHIP_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => sendEmailInviteMutation.mutate({
                        email: emailInviteEmail,
                        membershipType: emailInviteType,
                        patientName: emailInviteName || undefined,
                      })}
                      disabled={!emailInviteEmail || sendEmailInviteMutation.isPending}
                      className="w-full"
                      data-testid="button-send-email-invite"
                    >
                      {sendEmailInviteMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="mr-2 h-4 w-4" />
                      )}
                      Send Invitation
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Sent Invitations</CardTitle>
                <CardDescription>
                  Track invitations sent via email
                </CardDescription>
              </CardHeader>
              <CardContent>
                {invitesLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : invites && invites.filter(i => i.emailSentTo).length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Email</TableHead>
                          <TableHead>Code</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Sent</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invites.filter(i => i.emailSentTo).map((invite) => (
                          <TableRow key={invite.id} data-testid={`row-email-invite-${invite.id}`}>
                            <TableCell className="font-medium">
                              {invite.emailSentTo}
                            </TableCell>
                            <TableCell>
                              <code className="bg-muted px-2 py-1 rounded text-xs font-mono">
                                {invite.code}
                              </code>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {getMembershipLabel(invite.membershipType)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {invite.usedBy ? (
                                <Badge variant="secondary">Redeemed</Badge>
                              ) : (
                                <Badge variant="default">Pending</Badge>
                              )}
                            </TableCell>
                            <TableCell>{formatDate(invite.createdAt)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Mail className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No email invitations sent yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="subscribers" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>All Subscribers</CardTitle>
                <CardDescription>
                  Manage user subscriptions and extend memberships
                </CardDescription>
              </CardHeader>
              <CardContent>
                {subLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : subscribers && subscribers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User ID</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Expires</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Extend</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {subscribers.map((sub) => (
                          <TableRow key={sub.id} data-testid={`row-subscriber-${sub.id}`}>
                            <TableCell className="font-mono text-xs max-w-[200px] truncate">
                              {sub.userId}
                            </TableCell>
                            <TableCell>
                              <Badge variant={sub.status === "active" ? "default" : "secondary"}>
                                {isLifetime(sub.currentPeriodEnd) ? "Lifetime" : sub.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {isLifetime(sub.currentPeriodEnd) ? (
                                <span className="text-primary flex items-center gap-1">
                                  <Crown className="h-3 w-3" />
                                  Never
                                </span>
                              ) : (
                                formatDate(sub.currentPeriodEnd)
                              )}
                            </TableCell>
                            <TableCell>{formatDate(sub.createdAt)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Select
                                  value={selectedExtension[sub.userId] || ""}
                                  onValueChange={(value) => setSelectedExtension({ ...selectedExtension, [sub.userId]: value })}
                                >
                                  <SelectTrigger className="w-[140px]" data-testid={`select-extend-${sub.id}`}>
                                    <SelectValue placeholder="Extend..." />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {EXTENSION_TYPES.map((type) => (
                                      <SelectItem key={type.value} value={type.value}>
                                        {type.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    if (selectedExtension[sub.userId]) {
                                      extendSubscriptionMutation.mutate({
                                        userId: sub.userId,
                                        extensionType: selectedExtension[sub.userId],
                                      });
                                    }
                                  }}
                                  disabled={!selectedExtension[sub.userId] || extendSubscriptionMutation.isPending}
                                  data-testid={`button-extend-${sub.id}`}
                                >
                                  {extendSubscriptionMutation.isPending ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Apply"
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No subscribers yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="invites" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Create Invite Code</CardTitle>
                <CardDescription>
                  Generate invite codes to give users free access
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-end gap-4">
                  <div className="flex-1 space-y-2">
                    <Label>Membership Type</Label>
                    <Select value={newInviteType} onValueChange={setNewInviteType}>
                      <SelectTrigger data-testid="select-invite-type">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {MEMBERSHIP_TYPES.map((type) => (
                          <SelectItem key={type.value} value={type.value}>
                            {type.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    onClick={() => createInviteMutation.mutate(newInviteType)}
                    disabled={createInviteMutation.isPending}
                    data-testid="button-create-invite"
                  >
                    {createInviteMutation.isPending ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="mr-2 h-4 w-4" />
                    )}
                    Create Invite
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>All Invite Codes</CardTitle>
                <CardDescription>
                  View and manage invite codes
                </CardDescription>
              </CardHeader>
              <CardContent>
                {invitesLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : invites && invites.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Code</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invites.map((invite) => (
                          <TableRow key={invite.id} data-testid={`row-invite-${invite.id}`}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <code className="bg-muted px-2 py-1 rounded text-sm font-mono">
                                  {invite.code}
                                </code>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => copyCode(invite.code)}
                                  data-testid={`button-copy-${invite.id}`}
                                >
                                  {copiedCode === invite.code ? (
                                    <Check className="h-4 w-4 text-primary" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {getMembershipLabel(invite.membershipType)}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              {invite.usedBy ? (
                                <Badge variant="secondary">Used</Badge>
                              ) : (
                                <Badge variant="default">Available</Badge>
                              )}
                            </TableCell>
                            <TableCell>{formatDate(invite.createdAt)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => deleteInviteMutation.mutate(invite.id)}
                                disabled={deleteInviteMutation.isPending}
                                data-testid={`button-delete-${invite.id}`}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Gift className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No invite codes created yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
