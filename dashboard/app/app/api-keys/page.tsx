import { ApiKeysManager } from "@/components/app/ApiKeysManager";

export default function ApiKeysPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-display-xl">API keys</h1>
      <ApiKeysManager />
    </div>
  );
}
