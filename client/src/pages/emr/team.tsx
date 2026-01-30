import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "@/components/ui/dialog";
import { EmrConsentDialog } from "@/components/emr-consent-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Users,
  Shield,
  Building2,
  UserCheck,
  UserX,
  Crown,
  Loader2,
} from "lucide-react";

interface Practice {
  id: number;
  name: string;
  description?: string | null;
  hasEmrLicense: boolean;
  emrLicenseType?: string | null;
  emrMaxUsers?: number | null;
  emrActiveUsers?: number | null;
  ownerId?: string;
}

interface OrgAccess {
  practice: Practice;
  emrRole: string | null;
}

interface EmrAccessResponse {
  hasAccess: boolean;
  consentAcknowledged: boolean;
  accessType?: "vendor" | "organization" | "individual" | "none";
  organizations?: OrgAccess[];
}

interface PracticeMember {
  practiceId: number;
  userId: string;
  role: string;
  hasEmrAccess: boolean;
  emrRole: string | null;
  joinedAt: string;
}

interface UserPractice {
  practice: Practice;
  role: string;
  hasEmrAccess?: boolean;
  emrRole?: string | null;
}

const EMR_ROLES = [
  { value: "provider", label: "Provider" },
  { value: "nurse", label: "Nurse" },
  { value: "admin_staff", label: "Admin Staff" },
  { value: "emr_admin", label: "EMR Admin" },
];

export default function EmrTeamPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const [showConsentDialog, setShowConsentDialog] = useState(false);
  const [selectedOrgId, setSelectedOrgId] = useState<number | null>(null);
  const [pendingRole, setPendingRole] = useState<{ [userId: string]: string }>({});
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; userId: string; action: "grant" | "revoke" } | null>(null);

  const { data: emrAccess, isLoading: isCheckingAccess } = useQuery<EmrAccessResponse>({
    queryKey: ["/api/emr/access"],
  });

  const { data: userPractices } = useQuery<UserPractice[]>({
    queryKey: ["/api/practices"],
    enabled: emrAccess?.hasAccess === true && emrAccess?.consentAcknowledged === true,
  });

  const isVendor = emrAccess?.accessType === "vendor";
  const emrOrganizations = emrAccess?.organizations?.filter(org => org.practice?.hasEmrLicense).map(org => org.practice) || [];
  const managedOrganizations: Practice[] = isVendor ? emrOrganizations : userPractices?.filter(p => 
    p.practice.hasEmrLicense && (p.role === "owner" || p.role === "admin" || p.emrRole === "emr_admin")
  ).map(p => p.practice) || [];

  useEffect(() => {
    if (!isCheckingAccess && emrAccess && !emrAccess.hasAccess) {
      toast({
        title: "Access Denied",
        description: "You don't have access to the EMR system.",
        variant: "destructive",
      });
      setLocation("/");
    }
    if (!isCheckingAccess && emrAccess?.hasAccess && !emrAccess.consentAcknowledged) {
      setShowConsentDialog(true);
    }
    if (!isCheckingAccess && emrAccess?.hasAccess && managedOrganizations.length > 0 && !selectedOrgId) {
      setSelectedOrgId(managedOrganizations[0].id);
    }
  }, [emrAccess, isCheckingAccess, setLocation, toast, managedOrganizations, selectedOrgId]);

  const { data: members = [], isLoading: membersLoading } = useQuery<PracticeMember[]>({
    queryKey: ["/api/practices", selectedOrgId, "emr-members"],
    queryFn: async () => {
      if (!selectedOrgId) return [];
      const response = await fetch(`/api/practices/${selectedOrgId}/emr-members`, { credentials: "include" });
      if (!response.ok) throw new Error("Failed to fetch members");
      return response.json();
    },
    enabled: emrAccess?.hasAccess === true && emrAccess?.consentAcknowledged === true && selectedOrgId !== null,
  });

  const selectedOrg = managedOrganizations.find(o => o.id === selectedOrgId);

  const grantEmrAccessMutation = useMutation({
    mutationFn: async ({ userId, emrRole }: { userId: string; emrRole: string }) => {
      const response = await apiRequest("POST", `/api/practices/${selectedOrgId}/emr-access`, { userId, emrRole });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/practices", selectedOrgId, "emr-members"] });
      toast({
        title: "EMR Access Granted",
        description: "The team member now has EMR access",
      });
      setConfirmDialog(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to grant access",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  const revokeEmrAccessMutation = useMutation({
    mutationFn: async ({ userId }: { userId: string }) => {
      const response = await apiRequest("DELETE", `/api/practices/${selectedOrgId}/emr-access/${userId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/practices", selectedOrgId, "emr-members"] });
      toast({
        title: "EMR Access Revoked",
        description: "The team member no longer has EMR access",
      });
      setConfirmDialog(null);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to revoke access",
        description: error.message || "Please try again",
        variant: "destructive",
      });
    },
  });

  if (isCheckingAccess || !emrAccess?.hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  if (showConsentDialog && !emrAccess.consentAcknowledged) {
    return (
      <EmrConsentDialog 
        open={true} 
        onConsentGiven={() => setShowConsentDialog(false)} 
      />
    );
  }

  if (managedOrganizations.length === 0) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
              <h3 className="text-lg font-semibold mb-2">No Organizations to Manage</h3>
              <p className="text-muted-foreground">
                You need to be an owner or admin of an organization with an EMR license to manage team access.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const getEmrRoleLabel = (role: string | null) => {
    return EMR_ROLES.find(r => r.value === role)?.label || role || "No Role";
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      owner: "bg-purple-500/10 text-purple-600 border-purple-500/30",
      admin: "bg-blue-500/10 text-blue-600 border-blue-500/30",
      member: "bg-gray-500/10 text-gray-600 border-gray-500/30",
    };
    return colors[role] || colors.member;
  };

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto">
        {isVendor && emrOrganizations.length > 0 && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg border flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Vendor View</span>
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select
                value={selectedOrgId?.toString() || ""}
                onValueChange={(value) => setSelectedOrgId(parseInt(value))}
              >
                <SelectTrigger className="w-[250px]" data-testid="select-organization">
                  <SelectValue placeholder="Select organization..." />
                </SelectTrigger>
                <SelectContent>
                  {emrOrganizations.map((org) => (
                    <SelectItem key={org.id} value={org.id.toString()}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {!isVendor && managedOrganizations.length > 1 && (
          <div className="mb-4 p-3 bg-muted/50 rounded-lg border flex items-center gap-3">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            <Select
              value={selectedOrgId?.toString() || ""}
              onValueChange={(value) => setSelectedOrgId(parseInt(value))}
            >
              <SelectTrigger className="w-[250px]" data-testid="select-organization">
                <SelectValue placeholder="Select organization..." />
              </SelectTrigger>
              <SelectContent>
                {managedOrganizations.map((org) => (
                  <SelectItem key={org.id} value={org.id.toString()}>
                    {org.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6" />
              EMR Team Access
            </h1>
            <p className="text-muted-foreground">
              Manage who can access EMR features in your organization
            </p>
          </div>
        </div>

        {selectedOrg && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                {selectedOrg.name}
              </CardTitle>
              <CardDescription>
                License: {selectedOrg.emrLicenseType || "Standard"} | 
                Users: {selectedOrg.emrActiveUsers || 0} / {selectedOrg.emrMaxUsers || 5}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {membersLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : members.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User ID</TableHead>
                        <TableHead>Team Role</TableHead>
                        <TableHead>EMR Status</TableHead>
                        <TableHead>EMR Role</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {members.map((member) => (
                        <TableRow key={member.userId} data-testid={`row-member-${member.userId}`}>
                          <TableCell className="font-mono text-xs max-w-[200px] truncate">
                            {member.userId}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={getRoleColor(member.role)}>
                              {member.role}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {member.hasEmrAccess ? (
                              <Badge variant="default" className="bg-emerald-600">
                                <UserCheck className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary">
                                <UserX className="h-3 w-3 mr-1" />
                                No Access
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {member.hasEmrAccess ? (
                              <span className="text-sm">{getEmrRoleLabel(member.emrRole)}</span>
                            ) : (
                              <Select
                                value={pendingRole[member.userId] || "provider"}
                                onValueChange={(value) => setPendingRole({ ...pendingRole, [member.userId]: value })}
                              >
                                <SelectTrigger className="w-[130px]" data-testid={`select-role-${member.userId}`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {EMR_ROLES.map((role) => (
                                    <SelectItem key={role.value} value={role.value}>
                                      {role.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                          <TableCell>
                            {member.hasEmrAccess ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setConfirmDialog({ open: true, userId: member.userId, action: "revoke" })}
                                data-testid={`button-revoke-${member.userId}`}
                              >
                                Revoke
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => setConfirmDialog({ open: true, userId: member.userId, action: "grant" })}
                                data-testid={`button-grant-${member.userId}`}
                              >
                                Grant Access
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No team members found</p>
                  <p className="text-sm">Add members to your practice first to manage their EMR access</p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Dialog open={confirmDialog?.open || false} onOpenChange={(open) => !open && setConfirmDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirmDialog?.action === "grant" ? "Grant EMR Access" : "Revoke EMR Access"}
              </DialogTitle>
              <DialogDescription>
                {confirmDialog?.action === "grant" 
                  ? "This will allow the team member to access patient records and clinical documentation."
                  : "This will remove the team member's access to EMR features including patient records."}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDialog(null)}>
                Cancel
              </Button>
              <Button
                variant={confirmDialog?.action === "revoke" ? "destructive" : "default"}
                onClick={() => {
                  if (confirmDialog?.action === "grant") {
                    grantEmrAccessMutation.mutate({ 
                      userId: confirmDialog.userId, 
                      emrRole: pendingRole[confirmDialog.userId] || "provider" 
                    });
                  } else if (confirmDialog?.action === "revoke") {
                    revokeEmrAccessMutation.mutate({ userId: confirmDialog.userId });
                  }
                }}
                disabled={grantEmrAccessMutation.isPending || revokeEmrAccessMutation.isPending}
                data-testid="button-confirm-action"
              >
                {(grantEmrAccessMutation.isPending || revokeEmrAccessMutation.isPending) ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  confirmDialog?.action === "grant" ? "Grant Access" : "Revoke Access"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
