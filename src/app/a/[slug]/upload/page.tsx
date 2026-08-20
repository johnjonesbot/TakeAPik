import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Uploading now lives on the album tab itself (upload card above the gallery). */
export default async function UploadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/a/${slug}`);
}
