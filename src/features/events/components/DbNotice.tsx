import { Database } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";

export function DbNotice({ status }: { status: "no_db" | "db_error" }) {
  return (
    <EmptyState
      icon={Database}
      title={status === "no_db" ? "Connect your database" : "Database not ready"}
      body="Check DATABASE_URL in .env.local, then run npm run db:migrate and npm run db:seed."
    />
  );
}
