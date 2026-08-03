import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";

export default async function BossLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "boss") redirect("/employee");

  return (
    <div className="md:flex min-h-screen">
      <Sidebar name={profile.full_name} />
      <main className="flex-1 p-4 md:p-6 max-w-7xl w-full mx-auto">
        {children}
      </main>
    </div>
  );
}
