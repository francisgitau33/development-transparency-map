"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LoadingState } from "@/components/shared/LoadingState";
import { ErrorState } from "@/components/shared/ErrorState";
import { EmptyState } from "@/components/shared/EmptyState";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Users, CheckCircle, XCircle, Clock, Search, Shield } from "lucide-react";

interface User {
  id: string;
  email: string;
  displayName: string | null;
  role: {
    role: string;
    organizationId: string | null;
  } | null;
  organization: {
    id: string;
    name: string;
  } | null;
  createdAt: string;
}

interface PendingRequest {
  id: string;
  userId: string;
  email: string;
  displayName: string | null;
  organizationName: string | null;
  requestedAt: string;
  status: string;
  user: {
    id: string;
    email: string;
    displayName: string | null;
    createdAt: string;
  };
}

interface Organization {
  id: string;
  name: string;
}

export default function UsersPage() {
  const router = useRouter();
  const { isSystemOwner, isLoading: authLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<PendingRequest | null>(null);
  const [approveRole, setApproveRole] = useState("PARTNER_ADMIN");
  const [approveOrgId, setApproveOrgId] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!authLoading && !isSystemOwner) {
      router.replace("/dashboard");
    }
  }, [authLoading, isSystemOwner, router]);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [usersRes, pendingRes, orgsRes] = await Promise.all([
        fetch("/api/users?includePending=true"),
        fetch("/api/users/pending"),
        fetch("/api/organizations?activeOnly=true"),
      ]);

      if (!usersRes.ok) throw new Error("Failed to load users");

      const [usersData, pendingData, orgsData] = await Promise.all([
        usersRes.json(),
        pendingRes.json(),
        orgsRes.json(),
      ]);

      setUsers(usersData.users || []);
      setPendingRequests(pendingData.pendingRequests || []);
      setOrganizations(orgsData.organizations || []);
    } catch (err) {
      setError("Unable to load users. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isSystemOwner) {
      fetchData();
    }
  }, [isSystemOwner]);

  const openApproveDialog = (request: PendingRequest) => {
    setSelectedRequest(request);
    setApproveRole("PARTNER_ADMIN");
    setApproveOrgId("");
    setApproveDialogOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedRequest) return;
    if (approveRole === "PARTNER_ADMIN" && !approveOrgId) {
      toast.error("Please select an organization for Partner Admin role");
      return;
    }

    setProcessing(true);
    try {
      const res = await fetch(`/api/users/${selectedRequest.userId}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: approveRole,
          organizationId: approveRole === "PARTNER_ADMIN" ? approveOrgId : null,
        }),
      });

      if (!res.ok) throw new Error("Failed to approve user");

      toast.success("User approved successfully");
      setApproveDialogOpen(false);
      fetchData();
    } catch (err) {
      toast.error("Failed to approve user");
    } finally {
      setProcessing(false);
    }
  };

  const handleDecline = async (request: PendingRequest) => {
    if (!confirm(`Are you sure you want to decline ${request.email}'s access request?`)) return;

    try {
      const res = await fetch(`/api/users/${request.userId}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: "Access request declined" }),
      });

      if (!res.ok) throw new Error("Failed to decline user");

      toast.success("Access request declined");
      fetchData();
    } catch (err) {
      toast.error("Failed to decline user");
    }
  };

  const filteredUsers = users.filter(
    (u) =>
      u.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (authLoading || !isSystemOwner) {
    return null;
  }

  return (
    <div data-design-id="users-page" className="p-8">
      <div
        data-design-id="users-header"
        className="mb-6"
      >
        <h1
          data-design-id="users-title"
          className="text-2xl font-bold text-slate-900"
        >
          User Management
        </h1>
        <p
          data-design-id="users-subtitle"
          className="text-slate-600"
        >
          Manage users and access requests
        </p>
      </div>

      {loading && <LoadingState message="Loading users..." />}

      {error && <ErrorState message={error} onRetry={fetchData} />}

      {!loading && !error && (
        <Tabs defaultValue="pending" data-design-id="users-tabs">
          <TabsList className="mb-6">
            <TabsTrigger value="pending" className="flex items-center">
              <Clock className="w-4 h-4 mr-2" />
              Pending ({pendingRequests.length})
            </TabsTrigger>
            <TabsTrigger value="all" className="flex items-center">
              <Users className="w-4 h-4 mr-2" />
              All Users ({users.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pending">
            <Card data-design-id="pending-requests-card">
              <CardHeader>
                <CardTitle>Pending Access Requests</CardTitle>
                <CardDescription>
                  Review and approve or decline user access requests
                </CardDescription>
              </CardHeader>
              <CardContent>
                {pendingRequests.length === 0 ? (
                  <EmptyState
                    icon={<CheckCircle className="w-8 h-8 text-emerald-500" />}
                    title="No pending requests"
                    description="All access requests have been processed"
                  />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Organization</TableHead>
                        <TableHead>Requested</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pendingRequests.map((request) => (
                        <TableRow key={request.id} data-design-id={`pending-row-${request.id}`}>
                          <TableCell>
                            <div>
                              <div className="font-medium">
                                {request.displayName || "No name"}
                              </div>
                              <div className="text-sm text-slate-500">
                                {request.email}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {request.organizationName || "Not specified"}
                          </TableCell>
                          <TableCell>{formatDate(request.requestedAt)}</TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              onClick={() => openApproveDialog(request)}
                              className="mr-2 bg-emerald-600 hover:bg-emerald-700"
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDecline(request)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Decline
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="all">
            <Card data-design-id="all-users-card">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>All Users</CardTitle>
                    <CardDescription>{filteredUsers.length} users</CardDescription>
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Search users..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Organization</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id} data-design-id={`user-row-${user.id}`}>
                        <TableCell>
                          <div>
                            <div className="font-medium">
                              {user.displayName || "No name"}
                            </div>
                            <div className="text-sm text-slate-500">
                              {user.email}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {user.role ? (
                            <Badge
                              variant="outline"
                              className={
                                user.role.role === "SYSTEM_OWNER"
                                  ? "bg-purple-50 text-purple-700"
                                  : "bg-blue-50 text-blue-700"
                              }
                            >
                              <Shield className="w-3 h-3 mr-1" />
                              {user.role.role === "SYSTEM_OWNER" ? "System Owner" : "Partner Admin"}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700">
                              <Clock className="w-3 h-3 mr-1" />
                              Pending
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {user.organization?.name || "—"}
                        </TableCell>
                        <TableCell>{formatDate(user.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent data-design-id="approve-dialog">
          <DialogHeader>
            <DialogTitle>Approve Access Request</DialogTitle>
            <DialogDescription>
              Assign a role and organization to {selectedRequest?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="role">Role *</Label>
              <Select value={approveRole} onValueChange={setApproveRole}>
                <SelectTrigger id="role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="PARTNER_ADMIN">Partner Admin</SelectItem>
                  <SelectItem value="SYSTEM_OWNER">System Owner</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {approveRole === "PARTNER_ADMIN" && (
              <div className="grid gap-2">
                <Label htmlFor="organization">Organization *</Label>
                <Select value={approveOrgId} onValueChange={setApproveOrgId}>
                  <SelectTrigger id="organization">
                    <SelectValue placeholder="Select organization" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((org) => (
                      <SelectItem key={org.id} value={org.id}>
                        {org.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleApprove}
              disabled={processing}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {processing ? "Approving..." : "Approve User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}