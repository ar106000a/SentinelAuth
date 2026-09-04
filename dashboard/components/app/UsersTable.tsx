"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, Trash2, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import {
  fetchTenantUsers,
  deleteTenantUser,
  ApiError,
  type TenantUser,
  type PaginatedUsers,
} from "@/lib/api";
import { useToast } from "@/lib/toast";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 350;

function formatDate(value: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function UsersTable() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedUsers | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TenantUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async (searchValue: string, pageValue: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchTenantUsers({
        search: searchValue || undefined,
        page: pageValue,
        limit: PAGE_SIZE,
      });
      setData(result);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : "Couldn't load users. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search — resets to page 1 on every new query.
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1);
      load(search, 1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  useEffect(() => {
    load(search, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTenantUser(deleteTarget.id);
      toast({ variant: "success", title: "User deleted" });
      setDeleteTarget(null);
      load(search, page);
    } catch (err) {
      toast({
        variant: "danger",
        title: "Couldn't delete user",
        description:
          err instanceof ApiError
            ? err.message
            : "Check your connection and try again.",
      });
    } finally {
      setDeleting(false);
    }
  };

  const users = Array.isArray(data?.entries) ? data.entries : [];

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by email"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search users by email"
      />

      {loading && (
        <Card className="space-y-3 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      )}

      {!loading && error && (
        <Card>
          <EmptyState
            icon={<AlertTriangle />}
            title="Couldn't load users"
            description={error}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => load(search, page)}
              >
                Try again
              </Button>
            }
          />
        </Card>
      )}

      {!loading && !error && data && users.length === 0 && (
        <Card>
          <EmptyState
            icon={<Search />}
            title={search ? "No matching users" : "No users yet"}
            description={
              search
                ? "Try a different search."
                : "Users will appear here once they register through your app."
            }
          />
        </Card>
      )}

      {!loading && !error && data && users.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>MFA</TableHead>
                <TableHead>Last login</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>{user.isVerified ? "Yes" : "No"}</TableCell>
                  <TableCell>{user.mfaEnabled ? "Yes" : "No"}</TableCell>
                  <TableCell className="text-data text-xs">
                    {formatDate(user.lastLoginAt)}
                  </TableCell>
                  <TableCell className="text-data text-xs">
                    {formatDate(user.createdAt)}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(user)}
                      aria-label={`Delete ${user.email}`}
                      className="rounded-[var(--radius-sm)] p-1.5 text-[var(--color-text-secondary)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)]"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-caption">
                Page {data.page} of {data.totalPages} — {data.total} users
              </p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Previous
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete this user?"
        description={
          deleteTarget
            ? `This permanently deletes ${deleteTarget.email}. Their active sessions and pending OTP codes are revoked, their past login history is anonymized (kept for audit purposes but no longer linked to them), and their account is removed. This can't be undone.`
            : undefined
        }
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="ghost"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button variant="danger" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete user"}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
