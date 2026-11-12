import { requirePageOwner } from "@/server/access";
import { MobileAddButton, Nav } from "@/components/nav";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Server-side session check for every private page (middleware is only a hint).
  await requirePageOwner();
  return (
    <div className="min-h-dvh">
      <Nav />
      <main className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">{children}</main>
      <MobileAddButton />
    </div>
  );
}
