import { NextResponse, type NextRequest } from "next/server";

import { IMPORTS, templateCsv, type ImportKind } from "@/features/imports/templates";

/** Downloadable CSV templates with the expected columns and a fictional example row. */
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") as ImportKind;
  if (!(kind in IMPORTS)) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(templateCsv(kind), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="orderpilot-${kind}-template.csv"`,
    },
  });
}
