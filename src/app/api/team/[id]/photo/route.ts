import { type NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/team/[id]/photo
 *
 * Public endpoint that streams the bytes uploaded through the CMS photo
 * upload feature. The bytes are stored on TeamMember.photoData with the
 * confirmed MIME type on TeamMember.photoMimeType. This route never
 * returns content for:
 *   - unknown ids → 404
 *   - team members with no uploaded bytes (legacy rows whose photo is a
 *     plain URL, or rows without any photo) → 404, so the public /team
 *     page falls through to its legacy-URL / placeholder branches.
 *
 * Inactive rows are also returned here intentionally — the CMS preview
 * panel needs to show photos for unpublished team members. Publication
 * gating belongs to the list endpoint and the public page itself.
 *
 * Security note: there is no auth requirement here because the photos
 * are public-by-design (they render on a public page). Raw bytes are
 * NEVER served through the JSON /api/team list/item endpoints.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const member = await prisma.teamMember.findUnique({
      where: { id },
      select: {
        photoData: true,
        photoMimeType: true,
      },
    });

    if (!member || !member.photoData || !member.photoMimeType) {
      return NextResponse.json(
        { error: "Photo not found" },
        { status: 404 },
      );
    }

    // prisma returns Bytes as a Buffer in node. Copy into a fresh
    // Uint8Array because NextResponse's BodyInit type doesn't accept
    // Buffer directly.
    const bytes = new Uint8Array(member.photoData);

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        "Content-Type": member.photoMimeType,
        "Content-Length": String(bytes.byteLength),
        // Public, mildly cacheable. We don't version the URL yet, so
        // keep max-age modest; CMS edits will change the body but not
        // the URL. 5 minutes public + allow CDNs to revalidate.
        "Cache-Control": "public, max-age=300, must-revalidate",
        // Defensive: ensure the browser does not sniff-render as HTML.
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Team photo serve error:", error);
    return NextResponse.json(
      { error: "Failed to fetch photo" },
      { status: 500 },
    );
  }
}