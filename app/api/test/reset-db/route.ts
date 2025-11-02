import { NextResponse } from "next/server";

import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const IS_DEV = process.env.NODE_ENV !== "production";

export async function POST() {
  if (!IS_DEV) {
    return NextResponse.json({ error: "Resetten van data is alleen beschikbaar in development." }, { status: 403 });
  }

  const supabase = getSupabaseAdminClient();

  const tablesInDeleteOrder: Array<{ name: string; filterColumn: string }> = [
    { name: "call_attempts", filterColumn: "lookup_id" },
    { name: "phone_lookups", filterColumn: "id" },
    { name: "phone_profiles", filterColumn: "id" }
  ];

  const results: Record<string, { error?: string; count?: number }> = {};

  for (const table of tablesInDeleteOrder) {
    const { error, count } = await supabase
      .from(table.name)
      .delete({ count: "exact" })
      .neq(table.filterColumn, "00000000-0000-0000-0000-000000000000");

    if (error) {
      results[table.name] = { error: error.message ?? "Onbekende fout" };
      return NextResponse.json(
        {
          error: `Kon tabel ${table.name} niet leegmaken`,
          details: results
        },
        { status: 500 }
      );
    }

    results[table.name] = { count: count ?? 0 };
  }

  return NextResponse.json({
    success: true,
    cleared: results
  });
}
