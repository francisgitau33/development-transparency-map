import { NextResponse } from "next/server";
import { clearSession } from "@/lib/session";
import { logger, newRequestId } from "@/lib/logger";

export async function POST() {
  const requestId = newRequestId();
  try {
    await clearSession();
    return NextResponse.json(
      { message: "Logged out successfully" },
      { headers: { "x-request-id": requestId } },
    );
  } catch (error) {
    logger.error({
      event: "logout.unhandled_error",
      msg: "Logout route threw an unhandled error",
      requestId,
      error,
    });
    return NextResponse.json(
      { error: "Logout failed" },
      { status: 500, headers: { "x-request-id": requestId } },
    );
  }
}