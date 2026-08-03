import EmployeeClient from "./EmployeeClient";

// Rendered per-request: this page reads the signed-in user's data, so it must
// never be prerendered at build time (which would also make the build depend
// on the Supabase env vars being present).
export const dynamic = "force-dynamic";

export default function EmployeePage() {
  return <EmployeeClient />;
}
