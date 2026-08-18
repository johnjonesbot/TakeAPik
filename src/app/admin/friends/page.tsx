import { redirect } from "next/navigation";

/** The admin portal is a single settings page now; old links land there. */
export default function AdminRedirect() {
  redirect("/admin");
}
