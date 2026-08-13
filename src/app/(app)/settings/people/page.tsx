import { PageHeader } from "@/components/page-header";
import { PeopleScreen } from "@/components/people-screen";
import { getUsers, requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PeoplePage() {
  const me = await requireUser("/settings/people");

  return (
    <div className="pb-6">
      <PageHeader
        title="People"
        subtitle="Everyone who can get into this kitchen"
        backHref="/settings"
        compact
      />
      <PeopleScreen users={getUsers()} currentUserId={me.id} />
    </div>
  );
}
