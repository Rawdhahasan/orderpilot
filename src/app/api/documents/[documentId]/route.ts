import { NextResponse, type NextRequest } from "next/server";

import { createAdminClient } from "@/server/privileged/admin";
import { createClient } from "@/server/supabase/server";

/**
 * Streams an original document to a workspace member (FR-UPL-06). Access is
 * checked with the member's own client (RLS); only then is the private object
 * read. Nothing is cached and nothing is public.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> },
) {
  const { documentId } = await params;
  if (!/^[0-9a-f-]{36}$/.test(documentId)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  if (!user.user) return new NextResponse("Not found", { status: 404 });
  const { data: doc } = await supabase
    .from("source_documents")
    .select("storage_path, mime_type, original_filename, upload_status")
    .eq("id", documentId)
    .maybeSingle();
  if (!doc?.storage_path || doc.upload_status !== "stored")
    return new NextResponse("Not found", { status: 404 });

  const file = await createAdminClient()
    .storage.from("source-documents")
    .download(doc.storage_path);
  if (file.error || !file.data) return new NextResponse("Not found", { status: 404 });
  const download = request.nextUrl.searchParams.get("download") === "1";
  // FR-AUD-07: downloads are recorded in the audit trail (views in the review
  // screen are not, to keep the history readable).
  if (download) await supabase.rpc("record_document_download", { p_document_id: documentId });
  const safeName = doc.original_filename.replace(/[^\w.\- ]/g, "_");
  return new NextResponse(file.data.stream(), {
    headers: {
      "content-type": doc.mime_type,
      "content-disposition": `${download ? "attachment" : "inline"}; filename="${safeName}"`,
      "cache-control": "private, no-store",
    },
  });
}
