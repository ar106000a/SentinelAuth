"use client";

import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, ScrollText } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { RiskBadge } from "@/components/ui/Badge";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/Table";
import { fetchAuditLogs, ApiError, type AuditLogPage } from "@/lib/api";
import { KNOWN_EVENT_TYPES, formatEventType } from "@/lib/audit-log-format";

const PAGE_SIZE = 20;

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditLogTable() {
  const [eventType, setEventType] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<AuditLogPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (
      filters: { eventType: string; fromDate: string; toDate: string },
      pageValue: number
    ) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchAuditLogs({
          eventType: filters.eventType || undefined,
          fromDate: filters.fromDate || undefined,
          toDate: filters.toDate || undefined,
          page: pageValue,
          limit: PAGE_SIZE,
        });
        setData(result);
      } catch (err) {
        setError(
          err instanceof ApiError
            ? err.message
            : "Couldn't load the audit log. Check your connection and try again."
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    setPage(1);
    load({ eventType, fromDate, toDate }, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventType, fromDate, toDate]);

  useEffect(() => {
    load({ eventType, fromDate, toDate }, page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const filterInputClass =
    "h-10 rounded-[var(--radius-sm)] border border-[var(--color-border-strong)] bg-[var(--color-surface-raised)] px-3 text-sm text-[var(--color-text-primary)] outline-none focus-visible:border-[var(--color-focus)]";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className={filterInputClass}
        >
          <option value="">All events</option>
          {KNOWN_EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {formatEventType(type)}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={fromDate}
          onChange={(e) => setFromDate(e.target.value)}
          aria-label="From date"
          className={filterInputClass}
        />
        <input
          type="date"
          value={toDate}
          onChange={(e) => setToDate(e.target.value)}
          aria-label="To date"
          className={filterInputClass}
        />
      </div>

      {loading && (
        <Card className="space-y-3 p-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card>
      )}

      {!loading && error && (
        <Card>
          <EmptyState
            icon={<AlertTriangle />}
            title="Couldn't load the audit log"
            description={error}
            action={
              <Button
                variant="secondary"
                size="sm"
                onClick={() => load({ eventType, fromDate, toDate }, page)}
              >
                Try again
              </Button>
            }
          />
        </Card>
      )}

      {!loading && !error && data && data.entries.length === 0 && (
        <Card>
          <EmptyState
            icon={<ScrollText />}
            title="No matching events"
            description="Try widening your filters, or check back once there's been some login activity."
          />
        </Card>
      )}

      {!loading && !error && data && data.entries.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Event</TableHead>
                <TableHead>Risk</TableHead>
                <TableHead>MFA</TableHead>
                <TableHead>User</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{formatEventType(entry.eventType)}</TableCell>
                  <TableCell>
                    {entry.riskScore !== null ? (
                      <RiskBadge score={entry.riskScore} />
                    ) : (
                      <span className="text-caption">—</span>
                    )}
                  </TableCell>
                  <TableCell>{entry.mfaTriggered ? "Yes" : "No"}</TableCell>
                  <TableCell>
                    {entry.userEmail ?? (
                      <span className="text-caption">System</span>
                    )}
                  </TableCell>
                  <TableCell className="text-data text-xs">
                    {entry.ipAddress ?? "—"}
                  </TableCell>
                  <TableCell className="text-data text-xs">
                    {formatDateTime(entry.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-caption">
                Page {data.page} of {data.totalPages} — {data.total} events
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
    </div>
  );
}
