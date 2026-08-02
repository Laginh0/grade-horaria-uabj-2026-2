import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { sharedGrades } from "../../../db/schema";

type SharedGradeState = {
  version: number;
  selectedIds: string[];
  completedIds: string[];
  selectedOfferingIds: Record<string, string>;
  catalogTab: "all" | "completed" | "eligible" | "conflict-free";
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const jsonResponse = (body: unknown, status = 200, cacheControl?: string) =>
  Response.json(body, {
    status,
    headers: {
      ...corsHeaders,
      ...(cacheControl ? { "Cache-Control": cacheControl } : {}),
    },
  });

const normalizeIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)]
    .filter(
      (id): id is string =>
        typeof id === "string" && /^[a-z0-9-]{1,80}$/.test(id),
    )
    .sort()
    .slice(0, 60);
};

const normalizeState = (value: unknown): SharedGradeState | null => {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const completedIds = normalizeIds(input.completedIds);
  const completedSet = new Set(completedIds);
  const selectedIds = normalizeIds(input.selectedIds).filter(
    (id) => !completedSet.has(id),
  );
  const selectedSet = new Set(selectedIds);
  const rawOfferings =
    input.selectedOfferingIds && typeof input.selectedOfferingIds === "object"
      ? (input.selectedOfferingIds as Record<string, unknown>)
      : {};
  const selectedOfferingIds = Object.fromEntries(
    Object.entries(rawOfferings)
      .filter(
        ([id, offeringId]) =>
          selectedSet.has(id) &&
          typeof offeringId === "string" &&
          /^[a-z0-9-]{1,80}$/.test(offeringId),
      )
      .sort(([first], [second]) => first.localeCompare(second)),
  ) as Record<string, string>;
  const catalogTab =
    input.catalogTab === "completed" ||
    input.catalogTab === "eligible" ||
    input.catalogTab === "conflict-free"
      ? input.catalogTab
      : "all";

  return {
    version: 3,
    selectedIds,
    completedIds,
    selectedOfferingIds,
    catalogTab,
  };
};

const fingerprintFor = async (payload: string) => {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(payload),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
};

const codeCandidate = (fingerprint: string, offset: number) => {
  const base = Number.parseInt(fingerprint.slice(0, 12), 16) % 100_000;
  return String((base + offset) % 100_000).padStart(5, "0");
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!/^\d{5}$/.test(code)) {
    return jsonResponse({ error: "Informe um código de cinco dígitos." }, 400);
  }

  try {
    const db = getDb();
    const [record] = await db
      .select({ payload: sharedGrades.payload })
      .from(sharedGrades)
      .where(eq(sharedGrades.code, code))
      .limit(1);
    if (!record) {
      return jsonResponse({ error: "Código não encontrado." }, 404);
    }
    return jsonResponse(
      { code, state: JSON.parse(record.payload) },
      200,
      "public, max-age=31536000, immutable",
    );
  } catch {
    return jsonResponse({ error: "Não foi possível consultar o código." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 24_000) {
      return jsonResponse({ error: "A grade enviada é muito grande." }, 413);
    }
    const state = normalizeState(await request.json());
    if (!state || (state.selectedIds.length === 0 && state.completedIds.length === 0)) {
      return jsonResponse({ error: "Selecione alguma disciplina primeiro." }, 400);
    }

    const payload = JSON.stringify(state);
    if (payload.length > 20_000) {
      return jsonResponse({ error: "A grade enviada é muito grande." }, 413);
    }
    const fingerprint = await fingerprintFor(payload);
    const db = getDb();
    const [existing] = await db
      .select({ code: sharedGrades.code })
      .from(sharedGrades)
      .where(eq(sharedGrades.fingerprint, fingerprint))
      .limit(1);
    if (existing) return jsonResponse({ code: existing.code }, 200);

    for (let offset = 0; offset < 500; offset += 1) {
      const code = codeCandidate(fingerprint, offset);
      const [inserted] = await db
        .insert(sharedGrades)
        .values({ code, fingerprint, payload })
        .onConflictDoNothing()
        .returning({ code: sharedGrades.code });
      if (inserted) return jsonResponse({ code: inserted.code }, 201);

      const [sameState] = await db
        .select({ code: sharedGrades.code })
        .from(sharedGrades)
        .where(eq(sharedGrades.fingerprint, fingerprint))
        .limit(1);
      if (sameState) return jsonResponse({ code: sameState.code }, 200);
    }

    return jsonResponse(
      { error: "Não foi possível reservar um código agora. Tente novamente." },
      503,
    );
  } catch {
    return jsonResponse({ error: "Não foi possível gerar o código." }, 500);
  }
}
