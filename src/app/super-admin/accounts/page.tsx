import { redirect } from "next/navigation";

/** The Accounts view was consolidated onto the portal root. */
export default function SuperAdminAccountsPage() {
  redirect("/super-admin");
}
