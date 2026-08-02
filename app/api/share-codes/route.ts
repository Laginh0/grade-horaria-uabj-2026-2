import { eq } from "drizzle-orm";
import { getDb } from "../../../db";
import { sharedGrades } from "../../../db/schema";
import {
  ApiSecurityError,
  decryptStoredPayload,
  encryptStoredPayload,
  enforceRateLimit,
  optionsResponse,
  readJsonWithLimit,
  requireAllowedOrigin,
  requireApiSession,
  securityJson,
} from "../../../lib/api-security";

type SharedGradeState = {
  version: number;
  selectedIds: string[];
  completedIds: string[];
  selectedOfferingIds: Record<string, string>;
  priorities?: Record<string, number>;
  catalogTab:
    | "all"
    | "completed"
    | "eligible"
    | "conflict-free"
    | "unavailable";
};

const normalizeIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(value)]
    .filter(
      (id): id is string =>
        typeof id === "string" && /^[a-z0-9-]{1,80}$/.test(id),
    )
    .sort()
    .slice(0, 120);
};

const normalizePriorities = (value: unknown) => {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(
        ([id, priority]) =>
          /^[a-z0-9-]{1,80}$/.test(id) &&
          Number.isInteger(priority) &&
          Number(priority) >= 1 &&
          Number(priority) <= 5,
      )
      .sort(([first], [second]) => first.localeCompare(second))
      .slice(0, 120),
  ) as Record<string, number>;
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
    input.catalogTab === "conflict-free" ||
    input.catalogTab === "unavailable"
      ? input.catalogTab
      : "all";
  const priorities = normalizePriorities(input.priorities);

  return {
    version: 3,
    selectedIds,
    completedIds,
    selectedOfferingIds,
    ...(Object.keys(priorities).length > 0 ? { priorities } : {}),
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

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const rejected = requireAllowedOrigin(request);
  if (rejected) return rejected;
  const limited = enforceRateLimit(request, "share-read", 30, 600);
  if (limited) return limited;
  const invalidSession = await requireApiSession(request);
  if (invalidSession) return invalidSession;

  const code = new URL(request.url).searchParams.get("code")?.trim() ?? "";
  if (!/^\d{5}$/.test(code)) {
    return securityJson(
      request,
      { error: "Informe um código de cinco dígitos." },
      400,
    );
  }

  try {
    const db = getDb();
    const [record] = await db
      .select({ payload: sharedGrades.payload })
      .from(sharedGrades)
      .where(eq(sharedGrades.code, code))
      .limit(1);
    if (!record) {
      return securityJson(request, { error: "Código não encontrado." }, 404);
    }

    const decrypted = await decryptStoredPayload(record.payload);
    if (decrypted.wasLegacyPlaintext) {
      await db
        .update(sharedGrades)
        .set({ payload: await encryptStoredPayload(decrypted.plaintext) })
        .where(eq(sharedGrades.code, code));
    }
    return securityJson(
      request,
      { code, state: JSON.parse(decrypted.plaintext) },
      200,
      "private, max-age=300",
    );
  } catch (error) {
    if (error instanceof ApiSecurityError) {
      return securityJson(request, { error: error.message }, error.status);
    }
    return securityJson(
      request,
      { error: "Não foi possível consultar o código." },
      500,
    );
  }
}

export async function POST(request: Request) {
  const rejected = requireAllowedOrigin(request);
  if (rejected) return rejected;
  const limited = enforceRateLimit(request, "share-create", 8, 160);
  if (limited) return limited;
  const invalidSession = await requireApiSession(request);
  if (invalidSession) return invalidSession;

  try {
    const state = normalizeState(await readJsonWithLimit(request, 24_000));
    if (
      !state ||
      (state.selectedIds.length === 0 && state.completedIds.length === 0)
    ) {
      return securityJson(
        request,
        { error: "Selecione alguma disciplina primeiro." },
        400,
      );
    }

    const payload = JSON.stringify(state);
    if (payload.length > 20_000) {
      return securityJson(
        request,
        { error: "A grade enviada é muito grande." },
        413,
      );
    }
    const fingerprint = await fingerprintFor(payload);
    const db = getDb();
    const [existing] = await db
      .select({ code: sharedGrades.code })
      .from(sharedGrades)
      .where(eq(sharedGrades.fingerprint, fingerprint))
      .limit(1);
    if (existing) return securityJson(request, { code: existing.code });

    const protectedPayload = await encryptStoredPayload(payload);
    for (let offset = 0; offset < 500; offset += 1) {
      const code = codeCandidate(fingerprint, offset);
      const [inserted] = await db
        .insert(sharedGrades)
        .values({ code, fingerprint, payload: protectedPayload })
        .onConflictDoNothing()
        .returning({ code: sharedGrades.code });
      if (inserted) {
        return securityJson(request, { code: inserted.code }, 201);
      }

      const [sameState] = await db
        .select({ code: sharedGrades.code })
        .from(sharedGrades)
        .where(eq(sharedGrades.fingerprint, fingerprint))
        .limit(1);
      if (sameState) return securityJson(request, { code: sameState.code });
    }

    return securityJson(
      request,
      { error: "Não foi possível reservar um código agora. Tente novamente." },
      503,
    );
  } catch (error) {
    if (error instanceof ApiSecurityError) {
      return securityJson(request, { error: error.message }, error.status);
    }
    return securityJson(
      request,
      { error: "Não foi possível gerar o código." },
      500,
    );
  }
}
