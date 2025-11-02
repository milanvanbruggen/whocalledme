import { NextResponse } from "next/server";

/**
 * API endpoint to check DEV_DEBUG status
 * This allows client-side components to know if DEV_DEBUG is enabled server-side
 */
export async function GET() {
  const isDev = process.env.NODE_ENV !== "production";
  const rawDevDebug = process.env.DEV_DEBUG;
  const DEV_DEBUG_VALUE = rawDevDebug?.toLowerCase().trim();
  const DEV_DEBUG_ENABLED = DEV_DEBUG_VALUE === "true";

  // Return the debug status
  return NextResponse.json({
    isDev,
    devDebugEnabled: DEV_DEBUG_ENABLED,
    devDebugValue: rawDevDebug
  });
}

