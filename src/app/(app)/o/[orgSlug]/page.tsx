import { redirect } from "next/navigation";

export default async function WorkspaceIndex({ params }: { params: Promise<{ orgSlug: string }> }) {
  redirect(`/o/${(await params).orgSlug}/dashboard`);
}
