import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

export async function GET() {
  try {
    const aboutContent = await prisma.cmsAbout.findFirst({
      orderBy: { updatedAt: "desc" },
    });

    if (!aboutContent) {
      return NextResponse.json({
        content: {
          title: "About Map My Development Data",
          subtitle: "Promoting Transparency in Development",
          bodySections: [
            {
              type: "text",
              content:
                "Map My Development Data is a public platform that visualizes development projects worldwide, enabling transparency and accountability in the development sector.",
            },
            {
              type: "text",
              content:
                "Our mission is to make development data accessible to everyone, from researchers and policymakers to citizens and civil society organizations.",
            },
          ],
        },
      });
    }

    return NextResponse.json({
      content: {
        title: aboutContent.title,
        subtitle: aboutContent.subtitle,
        bodySections: aboutContent.bodySections,
      },
    });
  } catch (error) {
    console.error("Get CMS content error:", error);
    return NextResponse.json(
      { error: "Failed to fetch content" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { role: true },
    });

    if (user?.role?.role !== "SYSTEM_OWNER") {
      return NextResponse.json(
        { error: "Only system owners can edit CMS content" },
        { status: 403 }
      );
    }

    const { title, subtitle, bodySections } = await request.json();

    if (!title) {
      return NextResponse.json(
        { error: "Title is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.cmsAbout.findFirst();

    let content;
    if (existing) {
      content = await prisma.cmsAbout.update({
        where: { id: existing.id },
        data: {
          title: title.trim(),
          subtitle: subtitle?.trim() || null,
          bodySections: bodySections || [],
          updatedByUserId: session.userId,
        },
      });
    } else {
      content = await prisma.cmsAbout.create({
        data: {
          title: title.trim(),
          subtitle: subtitle?.trim() || null,
          bodySections: bodySections || [],
          updatedByUserId: session.userId,
        },
      });
    }

    return NextResponse.json({
      content: {
        title: content.title,
        subtitle: content.subtitle,
        bodySections: content.bodySections,
      },
      message: "Content updated successfully",
    });
  } catch (error) {
    console.error("Update CMS content error:", error);
    return NextResponse.json(
      { error: "Failed to update content" },
      { status: 500 }
    );
  }
}