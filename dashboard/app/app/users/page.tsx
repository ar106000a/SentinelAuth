import { UsersTable } from "@/components/app/UsersTable";

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-display-xl">Users</h1>
      <UsersTable />
    </div>
  );
}
