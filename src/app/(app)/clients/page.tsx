import { requireActiveSubscription } from "@/lib/subscription-guards";
import { ClientSearch } from "@/components/clients/client-search";

export default async function ClientsPage() {
  await requireActiveSubscription();
  return <ClientSearch />;
}
