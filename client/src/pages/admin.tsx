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
  Send,
  CreditCard,
  Settings,
  Edit,
  UserCog,
  Building2,
  X,
  Key,
  RefreshCw,
  AlertTriangle
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { EMR_ROLES, type EmrRoleType } from "@shared/schema";

interface Subscription {
  id: number;
  userId: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  status: string;
  currentPeriodEnd?: string;
  hasEmrAccess?: boolean;
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

interface Organization {
  id: number;
  name: string;
  ownerId: string;
  description?: string;
  hasEmrLicense?: boolean;
  emrLicenseType?: string;
  emrLicenseExpiry?: string;
  emrMaxUsers?: number;
  emrActiveUsers?: number;
  createdAt: string;
}

interface UserInfo {
  id: number;
  userId: string;
  firstName?: string;
  lastName?: string;
  preferredName?: string;
  specialty?: string;
  practiceName?: string;
  language?: string;
  createdAt: string;
}

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  scopes: string[];
  status: string;
  rateLimitPerMinute: number;
  lastUsedAt?: string;
  expiresAt?: string;
  createdAt: string;
  createdBy: string;
}

interface ApiKeyScopes {
  [scope: string]: string;
}

const EMR_LICENSE_TYPES = [
  { value: "trial", label: "30-Day Trial" },
  { value: "monthly", label: "Monthly" },
  { value: "annual", label: "Annual" },
  { value: "lifetime", label: "Lifetime" },
];

const MEMBERSHIP_TYPES = [
  { value: "trial_7", label: "7-Day Trial" },
  { value: "trial_14", label: "14-Day Trial" },
  { value: "trial_30", label: "30-Day Trial" },
  { value: "months_1", label: "1 Month Free" },
  { value: "months_3", label: "3 Months Free" },
  { value: "months_6", label: "6 Months Free" },
  { value: "months_12", label: "1 Year Free" },
  { value: "lifetime", label: "Lifetime Access" },
  // EMR Access types
  { value: "emr_access", label: "EMR Access (Add-on)" },
  { value: "emr_trial_30", label: "EMR + 30-Day Trial" },
  { value: "emr_months_1", label: "EMR + 1 Month" },
  { value: "emr_months_12", label: "EMR + 1 Year" },
  { value: "emr_lifetime", label: "EMR + Lifetime" },
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
  const [selectedEmrLicense, setSelectedEmrLicense] = useState<{ [key: number]: string }>({});
  const [selectedMaxUsers, setSelectedMaxUsers] = useState<{ [key: number]: string }>({});
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgOwnerId, setNewOrgOwnerId] = useState("");
  const [newOrgDescription, setNewOrgDescription] = useState("");
  const [selectedOrgForMember, setSelectedOrgForMember] = useState<number | null>(null);
  const [newMemberUserId, setNewMemberUserId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("member");
  
  // User settings management state
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [editUserEmrRole, setEditUserEmrRole] = useState("");
  const [editUserRequiresCosign, setEditUserRequiresCosign] = useState(false);
  const [editUserHasEmrAccess, setEditUserHasEmrAccess] = useState(false);
  
  // Organization members state
  const [viewingOrgMembers, setViewingOrgMembers] = useState<number | null>(null);
  const [orgMembers, setOrgMembers] = useState<any[]>([]);
  
  // API key management state
  const [selectedApiKeyOrg, setSelectedApiKeyOrg] = useState<number | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [apiKeysLoading, setApiKeysLoading] = useState(false);
  const [newApiKeyName, setNewApiKeyName] = useState("");
  const [newApiKeyScopes, setNewApiKeyScopes] = useState<string[]>([]);
  const [newApiKeyRateLimit, setNewApiKeyRateLimit] = useState("60");
  const [newApiKeyExpiry, setNewApiKeyExpiry] = useState("");
  const [showNewApiKeyDialog, setShowNewApiKeyDialog] = useState(false);
  const [newlyCreatedApiKey, setNewlyCreatedApiKey] = useState<string | null>(null);
  const [copiedApiKey, setCopiedApiKey] = useState(false);

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

  const { data: organizations, isLoading: orgsLoading } = useQuery<Organization[]>({
    queryKey: ["/api/admin/organizations"],
    enabled: !!user && adminCheck?.isAdmin === true,
  });

  const { data: allUsers, isLoading: usersLoading } = useQuery<UserInfo[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!user && adminCheck?.isAdmin === true,
  });

  const { data: apiKeyScopes } = useQuery<ApiKeyScopes>({
    queryKey: ["/api/admin/api-keys/scopes"],
    enabled: !!user && adminCheck?.isAdmin === true,
  });

  const fetchApiKeys = async (orgId: number) => {
    setApiKeysLoading(true);
    try {
      const response = await apiRequest("GET", `/api/admin/organizations/${orgId}/api-keys`);
      const keys = await response.json();
      setApiKeys(keys);
    } catch {
      toast({ title: "Failed to fetch API keys", variant: "destructive" });
    } finally {
      setApiKeysLoading(false);
    }
  };

  const createApiKeyMutation = useMutation({
    mutationFn: async (data: { orgId: number; name: string; scopes: string[]; rateLimitPerMinute: number; expiresAt?: string }) => {
      const response = await apiRequest("POST", `/api/admin/organizations/${data.orgId}/api-keys`, {
        name: data.name,
        scopes: data.scopes,
        rateLimitPerMinute: data.rateLimitPerMinute,
        expiresAt: data.expiresAt || undefined,
      });
      return response.json();
    },
    onSuccess: (data) => {
      setNewlyCreatedApiKey(data.apiKey);
      setNewApiKeyName("");
      setNewApiKeyScopes([]);
      setNewApiKeyRateLimit("60");
      setNewApiKeyExpiry("");
      if (selectedApiKeyOrg) {
        fetchApiKeys(selectedApiKeyOrg);
      }
      toast({
        title: "API key created",
        description: "Save the key now - it won't be shown again!",
      });
    },
    onError: () => {
      toast({
        title: "Failed to create API key",
        variant: "destructive",
      });
    },
  });

  const revokeApiKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      await apiRequest("POST", `/api/admin/api-keys/${keyId}/revoke`);
    },
    onSuccess: () => {
      if (selectedApiKeyOrg) {
        fetchApiKeys(selectedApiKeyOrg);
      }
      toast({ title: "API key revoked" });
    },
    onError: () => {
      toast({ title: "Failed to revoke API key", variant: "destructive" });
    },
  });

  const deleteApiKeyMutation = useMutation({
    mutationFn: async (keyId: number) => {
      await apiRequest("DELETE", `/api/admin/api-keys/${keyId}`);
    },
    onSuccess: () => {
      if (selectedApiKeyOrg) {
        fetchApiKeys(selectedApiKeyOrg);
      }
      toast({ title: "API key deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete API key", variant: "destructive" });
    },
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

  const grantEmrAccessMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const response = await apiRequest("POST", "/api/admin/grant-emr-access", { userId });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/subscribers"] });
      toast({
        title: "EMR Access Granted",
        description: "The user now has access to the EMR system",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to grant EMR access",
        description: error.message || "User must have an active subscription",
        variant: "destructive",
      });
    },
  });

  const grantEmrLicenseMutation = useMutation({
    mutationFn: async ({ organizationId, licenseType, maxUsers }: { organizationId: number; licenseType: string; maxUsers: number }) => {
      const expiryDate = licenseType === "lifetime" ? null : 
        licenseType === "trial" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() :
        licenseType === "monthly" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() :
        new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      
      const response = await apiRequest("POST", `/api/admin/organizations/${organizationId}/emr-license`, { 
        licenseType, 
        expiryDate,
        maxUsers 
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      toast({
        title: "EMR License Granted",
        description: "The organization now has EMR access",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to grant EMR license",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const revokeEmrLicenseMutation = useMutation({
    mutationFn: async ({ organizationId }: { organizationId: number }) => {
      const response = await apiRequest("DELETE", `/api/admin/organizations/${organizationId}/emr-license`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      toast({
        title: "EMR License Revoked",
        description: "The organization no longer has EMR access",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to revoke EMR license",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const createOrganizationMutation = useMutation({
    mutationFn: async ({ name, ownerId, description }: { name: string; ownerId: string; description?: string }) => {
      const response = await apiRequest("POST", "/api/admin/organizations", { name, ownerId, description });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      setNewOrgName("");
      setNewOrgOwnerId("");
      setNewOrgDescription("");
      toast({
        title: "Organization Created",
        description: "The new organization has been created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create organization",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const addMemberMutation = useMutation({
    mutationFn: async ({ organizationId, userId, role }: { organizationId: number; userId: string; role: string }) => {
      const response = await apiRequest("POST", `/api/admin/organizations/${organizationId}/members`, { userId, role });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/organizations"] });
      setNewMemberUserId("");
      setSelectedOrgForMember(null);
      toast({
        title: "Member Added",
        description: "The user has been added to the organization",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to add member",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const updateUserSettingsMutation = useMutation({
    mutationFn: async ({ userId, emrRole, requiresCosignature, hasEmrAccess }: { userId: string; emrRole?: string; requiresCosignature?: boolean; hasEmrAccess?: boolean }) => {
      const response = await apiRequest("PUT", `/api/admin/users/${userId}/settings`, { emrRole, requiresCosignature, hasEmrAccess });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser(null);
      toast({
        title: "User Settings Updated",
        description: "The user's settings have been saved",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update settings",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ organizationId, userId }: { organizationId: number; userId: string }) => {
      await apiRequest("DELETE", `/api/admin/organizations/${organizationId}/members/${userId}`);
    },
    onSuccess: () => {
      if (viewingOrgMembers) {
        fetchOrgMembers(viewingOrgMembers);
      }
      toast({
        title: "Member Removed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove member",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const fetchOrgMembers = async (orgId: number) => {
    try {
      const response = await apiRequest("GET", `/api/admin/organizations/${orgId}/members`);
      const members = await response.json();
      setOrgMembers(members);
    } catch (error) {
      toast({ title: "Failed to load members", variant: "destructive" });
    }
  };

  const openEditUser = async (userInfo: UserInfo) => {
    setEditingUser(userInfo);
    // Fetch user details to get current settings
    try {
      const response = await apiRequest("GET", `/api/admin/users/${userInfo.userId}/details`);
      const data = await response.json();
      setEditUserEmrRole(data.settings?.emrRole || "");
      setEditUserRequiresCosign(data.settings?.requiresCosignature || false);
      setEditUserHasEmrAccess(data.subscription?.hasEmrAccess || false);
    } catch {
      setEditUserEmrRole("");
      setEditUserRequiresCosign(false);
      setEditUserHasEmrAccess(false);
    }
  };

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
        <Tabs defaultValue="organizations" className="space-y-6">
          <TabsList className="flex-wrap">
            <TabsTrigger value="users" data-testid="tab-users">
              <Users className="mr-2 h-4 w-4" />
              Users
            </TabsTrigger>
            <TabsTrigger value="organizations" data-testid="tab-organizations">
              <Shield className="mr-2 h-4 w-4" />
              Organizations
            </TabsTrigger>
            <TabsTrigger value="email-invites" data-testid="tab-email-invites">
              <Mail className="mr-2 h-4 w-4" />
              Email Invites
            </TabsTrigger>
            <TabsTrigger value="subscribers" data-testid="tab-subscribers">
              <CreditCard className="mr-2 h-4 w-4" />
              Subscribers
            </TabsTrigger>
            <TabsTrigger value="invites" data-testid="tab-invites">
              <Gift className="mr-2 h-4 w-4" />
              Invite Codes
            </TabsTrigger>
            <TabsTrigger value="api-keys" data-testid="tab-api-keys">
              <Key className="mr-2 h-4 w-4" />
              API Keys
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  All Users
                </CardTitle>
                <CardDescription>
                  View all registered users and their settings
                </CardDescription>
              </CardHeader>
              <CardContent>
                {usersLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : allUsers && allUsers.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User ID</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Specialty</TableHead>
                          <TableHead>Practice</TableHead>
                          <TableHead>Joined</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {allUsers.map((userInfo) => (
                          <TableRow key={userInfo.id} data-testid={`row-user-${userInfo.id}`}>
                            <TableCell className="font-mono text-xs max-w-[150px] truncate">
                              {userInfo.userId}
                            </TableCell>
                            <TableCell>
                              {userInfo.preferredName || `${userInfo.firstName || ""} ${userInfo.lastName || ""}`.trim() || "-"}
                            </TableCell>
                            <TableCell>{userInfo.specialty || "-"}</TableCell>
                            <TableCell>{userInfo.practiceName || "-"}</TableCell>
                            <TableCell>{formatDate(userInfo.createdAt)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openEditUser(userInfo)}
                                  data-testid={`button-edit-user-${userInfo.id}`}
                                >
                                  <UserCog className="h-3 w-3 mr-1" />
                                  Settings
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    navigator.clipboard.writeText(userInfo.userId);
                                    toast({ title: "User ID copied" });
                                  }}
                                  data-testid={`button-copy-userid-${userInfo.id}`}
                                >
                                  <Copy className="h-3 w-3" />
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
                    <p>No users yet</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="organizations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Plus className="h-5 w-5" />
                  Create Organization
                </CardTitle>
                <CardDescription>
                  Create a new organization/practice. Copy a User ID from the Users tab to set as owner.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label htmlFor="org-name">Organization Name *</Label>
                    <Input
                      id="org-name"
                      placeholder="Clinic Name"
                      value={newOrgName}
                      onChange={(e) => setNewOrgName(e.target.value)}
                      data-testid="input-org-name"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-owner">Owner User ID *</Label>
                    <Input
                      id="org-owner"
                      placeholder="Paste User ID"
                      value={newOrgOwnerId}
                      onChange={(e) => setNewOrgOwnerId(e.target.value)}
                      data-testid="input-org-owner"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="org-description">Description</Label>
                    <Input
                      id="org-description"
                      placeholder="Optional description"
                      value={newOrgDescription}
                      onChange={(e) => setNewOrgDescription(e.target.value)}
                      data-testid="input-org-description"
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => createOrganizationMutation.mutate({
                        name: newOrgName,
                        ownerId: newOrgOwnerId,
                        description: newOrgDescription || undefined,
                      })}
                      disabled={!newOrgName || !newOrgOwnerId || createOrganizationMutation.isPending}
                      className="w-full"
                      data-testid="button-create-org"
                    >
                      {createOrganizationMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      Create
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Add Member to Organization
                </CardTitle>
                <CardDescription>
                  Add a user to an existing organization
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Organization *</Label>
                    <Select
                      value={selectedOrgForMember?.toString() || ""}
                      onValueChange={(value) => setSelectedOrgForMember(parseInt(value))}
                    >
                      <SelectTrigger data-testid="select-org-for-member">
                        <SelectValue placeholder="Select organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations?.map((org) => (
                          <SelectItem key={org.id} value={org.id.toString()}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="member-userid">User ID *</Label>
                    <Input
                      id="member-userid"
                      placeholder="Paste User ID"
                      value={newMemberUserId}
                      onChange={(e) => setNewMemberUserId(e.target.value)}
                      data-testid="input-member-userid"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Role</Label>
                    <Select value={newMemberRole} onValueChange={setNewMemberRole}>
                      <SelectTrigger data-testid="select-member-role">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      onClick={() => {
                        if (selectedOrgForMember) {
                          addMemberMutation.mutate({
                            organizationId: selectedOrgForMember,
                            userId: newMemberUserId,
                            role: newMemberRole,
                          });
                        }
                      }}
                      disabled={!selectedOrgForMember || !newMemberUserId || addMemberMutation.isPending}
                      className="w-full"
                      data-testid="button-add-member"
                    >
                      {addMemberMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="mr-2 h-4 w-4" />
                      )}
                      Add Member
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  EMR Organization Licenses
                </CardTitle>
                <CardDescription>
                  Manage EMR access for organizations. Grant or revoke EMR licenses to practices.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {orgsLoading ? (
                  <Skeleton className="h-48 w-full" />
                ) : organizations && organizations.length > 0 ? (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Organization</TableHead>
                          <TableHead>Owner ID</TableHead>
                          <TableHead>EMR Status</TableHead>
                          <TableHead>License Type</TableHead>
                          <TableHead>Users</TableHead>
                          <TableHead>Expires</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {organizations.map((org) => (
                          <TableRow key={org.id} data-testid={`row-org-${org.id}`}>
                            <TableCell className="font-medium">{org.name}</TableCell>
                            <TableCell className="font-mono text-xs max-w-[150px] truncate">{org.ownerId}</TableCell>
                            <TableCell>
                              {org.hasEmrLicense ? (
                                <Badge variant="default" className="bg-emerald-600" data-testid={`badge-emr-active-${org.id}`}>
                                  <Shield className="h-3 w-3 mr-1" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary">No License</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {org.hasEmrLicense ? (
                                <span className="capitalize">{org.emrLicenseType}</span>
                              ) : "-"}
                            </TableCell>
                            <TableCell>
                              {org.hasEmrLicense ? (
                                <span>{org.emrActiveUsers || 0} / {org.emrMaxUsers || 5}</span>
                              ) : "-"}
                            </TableCell>
                            <TableCell>
                              {org.hasEmrLicense && org.emrLicenseExpiry ? (
                                formatDate(org.emrLicenseExpiry)
                              ) : org.hasEmrLicense && org.emrLicenseType === "lifetime" ? (
                                <span className="text-primary flex items-center gap-1">
                                  <Crown className="h-3 w-3" />
                                  Never
                                </span>
                              ) : "-"}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => {
                                    setViewingOrgMembers(org.id);
                                    fetchOrgMembers(org.id);
                                  }}
                                  data-testid={`button-view-members-${org.id}`}
                                >
                                  <Users className="h-3 w-3 mr-1" />
                                  Members
                                </Button>
                                {org.hasEmrLicense ? (
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => revokeEmrLicenseMutation.mutate({ organizationId: org.id })}
                                    disabled={revokeEmrLicenseMutation.isPending}
                                    data-testid={`button-revoke-emr-${org.id}`}
                                  >
                                    {revokeEmrLicenseMutation.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      "Revoke"
                                    )}
                                  </Button>
                                ) : (
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={selectedEmrLicense[org.id] || ""}
                                    onValueChange={(value) => setSelectedEmrLicense({ ...selectedEmrLicense, [org.id]: value })}
                                  >
                                    <SelectTrigger className="w-[120px]" data-testid={`select-license-${org.id}`}>
                                      <SelectValue placeholder="License..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {EMR_LICENSE_TYPES.map((type) => (
                                        <SelectItem key={type.value} value={type.value}>
                                          {type.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    type="number"
                                    placeholder="Users"
                                    className="w-[70px]"
                                    value={selectedMaxUsers[org.id] || "5"}
                                    onChange={(e) => setSelectedMaxUsers({ ...selectedMaxUsers, [org.id]: e.target.value })}
                                    data-testid={`input-max-users-${org.id}`}
                                  />
                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      if (selectedEmrLicense[org.id]) {
                                        grantEmrLicenseMutation.mutate({
                                          organizationId: org.id,
                                          licenseType: selectedEmrLicense[org.id],
                                          maxUsers: parseInt(selectedMaxUsers[org.id] || "5"),
                                        });
                                      }
                                    }}
                                    disabled={!selectedEmrLicense[org.id] || grantEmrLicenseMutation.isPending}
                                    data-testid={`button-grant-license-${org.id}`}
                                  >
                                    {grantEmrLicenseMutation.isPending ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      "Grant"
                                    )}
                                  </Button>
                                </div>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No organizations yet</p>
                    <p className="text-sm">Organizations are created when users set up practices/teams</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

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
                          <TableHead>EMR Access</TableHead>
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
                              {sub.hasEmrAccess ? (
                                <Badge variant="default" className="bg-emerald-600" data-testid={`badge-emr-${sub.id}`}>
                                  <Shield className="h-3 w-3 mr-1" />
                                  Active
                                </Badge>
                              ) : sub.status === "active" ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => grantEmrAccessMutation.mutate({ userId: sub.userId })}
                                  disabled={grantEmrAccessMutation.isPending}
                                  data-testid={`button-grant-emr-${sub.id}`}
                                >
                                  {grantEmrAccessMutation.isPending ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    "Grant EMR"
                                  )}
                                </Button>
                              ) : (
                                <span className="text-muted-foreground text-xs">Requires active sub</span>
                              )}
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

          <TabsContent value="api-keys" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  API Key Management
                </CardTitle>
                <CardDescription>
                  Generate and manage API keys for external integrations (e.g., urgent care websites)
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                  <div className="space-y-2 flex-1">
                    <Label>Select Organization</Label>
                    <Select
                      value={selectedApiKeyOrg?.toString() || ""}
                      onValueChange={(value) => {
                        const orgId = parseInt(value);
                        setSelectedApiKeyOrg(orgId);
                        fetchApiKeys(orgId);
                      }}
                    >
                      <SelectTrigger data-testid="select-api-key-org">
                        <SelectValue placeholder="Select organization" />
                      </SelectTrigger>
                      <SelectContent>
                        {organizations?.map((org) => (
                          <SelectItem key={org.id} value={org.id.toString()}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {selectedApiKeyOrg && (
                    <Button
                      onClick={() => setShowNewApiKeyDialog(true)}
                      data-testid="button-new-api-key"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      New API Key
                    </Button>
                  )}
                </div>

                {selectedApiKeyOrg && (
                  <>
                    {apiKeysLoading ? (
                      <div className="space-y-2">
                        {[1, 2].map((i) => (
                          <Skeleton key={i} className="h-16 w-full" />
                        ))}
                      </div>
                    ) : apiKeys.length > 0 ? (
                      <div className="overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Name</TableHead>
                              <TableHead>Key Prefix</TableHead>
                              <TableHead>Scopes</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead>Rate Limit</TableHead>
                              <TableHead>Last Used</TableHead>
                              <TableHead>Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {apiKeys.map((key) => (
                              <TableRow key={key.id} data-testid={`row-api-key-${key.id}`}>
                                <TableCell className="font-medium">{key.name}</TableCell>
                                <TableCell className="font-mono text-xs">{key.keyPrefix}...</TableCell>
                                <TableCell>
                                  <div className="flex flex-wrap gap-1">
                                    {key.scopes.slice(0, 2).map((scope) => (
                                      <Badge key={scope} variant="secondary" className="text-xs">
                                        {scope.split(":")[0]}
                                      </Badge>
                                    ))}
                                    {key.scopes.length > 2 && (
                                      <Badge variant="outline" className="text-xs">
                                        +{key.scopes.length - 2}
                                      </Badge>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  {key.status === "active" ? (
                                    <Badge variant="default" className="bg-emerald-600">Active</Badge>
                                  ) : (
                                    <Badge variant="destructive">Revoked</Badge>
                                  )}
                                </TableCell>
                                <TableCell>{key.rateLimitPerMinute}/min</TableCell>
                                <TableCell className="text-sm text-muted-foreground">
                                  {key.lastUsedAt ? formatDate(key.lastUsedAt) : "Never"}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    {key.status === "active" && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => revokeApiKeyMutation.mutate(key.id)}
                                        disabled={revokeApiKeyMutation.isPending}
                                        data-testid={`button-revoke-key-${key.id}`}
                                      >
                                        <AlertTriangle className="h-3 w-3 mr-1" />
                                        Revoke
                                      </Button>
                                    )}
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => deleteApiKeyMutation.mutate(key.id)}
                                      disabled={deleteApiKeyMutation.isPending}
                                      data-testid={`button-delete-key-${key.id}`}
                                    >
                                      <Trash2 className="h-4 w-4 text-destructive" />
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
                        <Key className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No API keys created for this organization</p>
                        <p className="text-sm">Create an API key to enable external integrations</p>
                      </div>
                    )}
                  </>
                )}

                {!selectedApiKeyOrg && (
                  <div className="text-center py-8 text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Select an organization to manage API keys</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Create API Key Dialog */}
      <Dialog open={showNewApiKeyDialog} onOpenChange={(open) => {
        if (!open) {
          setShowNewApiKeyDialog(false);
          setNewlyCreatedApiKey(null);
          setCopiedApiKey(false);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Key className="h-5 w-5 text-primary" />
              {newlyCreatedApiKey ? "API Key Created" : "Create New API Key"}
            </DialogTitle>
            <DialogDescription>
              {newlyCreatedApiKey 
                ? "Save this key now - it won't be shown again!" 
                : "Configure the API key settings and permissions"}
            </DialogDescription>
          </DialogHeader>

          {newlyCreatedApiKey ? (
            <div className="space-y-4 py-4">
              <div className="p-4 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2 text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">Save this key securely</span>
                </div>
                <p className="text-sm text-amber-600 dark:text-amber-400">
                  This is the only time you'll see this API key. Store it in a secure location.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  value={newlyCreatedApiKey}
                  readOnly
                  className="font-mono text-sm"
                  data-testid="input-new-api-key"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(newlyCreatedApiKey);
                    setCopiedApiKey(true);
                    setTimeout(() => setCopiedApiKey(false), 2000);
                    toast({ title: "API key copied to clipboard" });
                  }}
                  data-testid="button-copy-api-key"
                >
                  {copiedApiKey ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="api-key-name">Key Name *</Label>
                <Input
                  id="api-key-name"
                  placeholder="e.g., Urgent Care Integration"
                  value={newApiKeyName}
                  onChange={(e) => setNewApiKeyName(e.target.value)}
                  data-testid="input-api-key-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Scopes *</Label>
                <p className="text-xs text-muted-foreground">Select the permissions for this API key</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {apiKeyScopes && Object.entries(apiKeyScopes).map(([scope, description]) => (
                    <div key={scope} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={`scope-${scope}`}
                        checked={newApiKeyScopes.includes(scope)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setNewApiKeyScopes([...newApiKeyScopes, scope]);
                          } else {
                            setNewApiKeyScopes(newApiKeyScopes.filter((s) => s !== scope));
                          }
                        }}
                        className="rounded"
                        data-testid={`checkbox-scope-${scope}`}
                      />
                      <Label htmlFor={`scope-${scope}`} className="text-sm cursor-pointer">
                        {scope}
                        <span className="block text-xs text-muted-foreground">{description}</span>
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rate-limit">Rate Limit (per minute)</Label>
                  <Input
                    id="rate-limit"
                    type="number"
                    value={newApiKeyRateLimit}
                    onChange={(e) => setNewApiKeyRateLimit(e.target.value)}
                    data-testid="input-rate-limit"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expiry">Expiry Date (optional)</Label>
                  <Input
                    id="expiry"
                    type="date"
                    value={newApiKeyExpiry}
                    onChange={(e) => setNewApiKeyExpiry(e.target.value)}
                    data-testid="input-expiry"
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            {newlyCreatedApiKey ? (
              <Button
                onClick={() => {
                  setShowNewApiKeyDialog(false);
                  setNewlyCreatedApiKey(null);
                  setCopiedApiKey(false);
                }}
                data-testid="button-close-dialog"
              >
                Done
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  onClick={() => setShowNewApiKeyDialog(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    if (selectedApiKeyOrg && newApiKeyName && newApiKeyScopes.length > 0) {
                      createApiKeyMutation.mutate({
                        orgId: selectedApiKeyOrg,
                        name: newApiKeyName,
                        scopes: newApiKeyScopes,
                        rateLimitPerMinute: parseInt(newApiKeyRateLimit) || 60,
                        expiresAt: newApiKeyExpiry || undefined,
                      });
                    }
                  }}
                  disabled={!newApiKeyName || newApiKeyScopes.length === 0 || createApiKeyMutation.isPending}
                  data-testid="button-create-api-key"
                >
                  {createApiKeyMutation.isPending ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Key className="mr-2 h-4 w-4" />
                  )}
                  Create API Key
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit User Settings Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-primary" />
              Edit User Settings
            </DialogTitle>
            <DialogDescription>
              Configure EMR role and access for {editingUser?.preferredName || `${editingUser?.firstName || ""} ${editingUser?.lastName || ""}`.trim() || editingUser?.userId}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="emr-role">EMR Role</Label>
              <Select value={editUserEmrRole} onValueChange={setEditUserEmrRole}>
                <SelectTrigger id="emr-role" data-testid="select-edit-emr-role">
                  <SelectValue placeholder="Select EMR role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">No Role</SelectItem>
                  {Object.entries(EMR_ROLES).map(([key, role]) => (
                    <SelectItem key={key} value={key}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Physician, NP/PA, Scribe, Front Desk, etc.
              </p>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <Label htmlFor="emr-access" className="text-sm font-medium">
                  EMR Access
                </Label>
                <p className="text-xs text-muted-foreground">
                  Allow this user to access EMR features
                </p>
              </div>
              <Switch
                id="emr-access"
                checked={editUserHasEmrAccess}
                onCheckedChange={setEditUserHasEmrAccess}
                data-testid="switch-edit-emr-access"
              />
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <div className="space-y-1">
                <Label htmlFor="requires-cosign" className="text-sm font-medium">
                  Requires Co-signature
                </Label>
                <p className="text-xs text-muted-foreground">
                  Encounters require supervising physician co-signature
                </p>
              </div>
              <Switch
                id="requires-cosign"
                checked={editUserRequiresCosign}
                onCheckedChange={setEditUserRequiresCosign}
                data-testid="switch-edit-cosign"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingUser) {
                  updateUserSettingsMutation.mutate({
                    userId: editingUser.userId,
                    emrRole: editUserEmrRole || undefined,
                    requiresCosignature: editUserRequiresCosign,
                    hasEmrAccess: editUserHasEmrAccess,
                  });
                }
              }}
              disabled={updateUserSettingsMutation.isPending}
              data-testid="button-save-user-settings"
            >
              {updateUserSettingsMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Organization Members Dialog */}
      <Dialog open={viewingOrgMembers !== null} onOpenChange={(open) => !open && setViewingOrgMembers(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Organization Members
            </DialogTitle>
            <DialogDescription>
              Manage members for {organizations?.find(o => o.id === viewingOrgMembers)?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            {orgMembers.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>EMR Role</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orgMembers.map((member, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs max-w-[150px] truncate">
                        {member.userId}
                      </TableCell>
                      <TableCell>
                        <Badge variant={member.role === "owner" ? "default" : "secondary"}>
                          {member.role}
                        </Badge>
                      </TableCell>
                      <TableCell>{member.emrRole || "-"}</TableCell>
                      <TableCell>
                        {member.role !== "owner" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (viewingOrgMembers) {
                                removeMemberMutation.mutate({
                                  organizationId: viewingOrgMembers,
                                  userId: member.userId,
                                });
                              }
                            }}
                            disabled={removeMemberMutation.isPending}
                          >
                            <X className="h-3 w-3 text-destructive" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No members yet</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewingOrgMembers(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
