import {
  ApiSecurityError,
  createChallenge,
  enforceRateLimit,
  exchangeChallenge,
  optionsResponse,
  readJsonWithLimit,
  requireAllowedOrigin,
  securityJson,
} from "../../../../lib/api-security";

export function OPTIONS(request: Request) {
  return optionsResponse(request);
}

export async function GET(request: Request) {
  const rejected = requireAllowedOrigin(request);
  if (rejected) return rejected;
  const limited = enforceRateLimit(request, "session-challenge", 12, 240);
  if (limited) return limited;

  try {
    return securityJson(request, await createChallenge(request));
  } catch (error) {
    if (error instanceof ApiSecurityError) {
      return securityJson(request, { error: error.message }, error.status);
    }
    return securityJson(request, { error: "A verificação segura falhou." }, 500);
  }
}

export async function POST(request: Request) {
  const rejected = requireAllowedOrigin(request);
  if (rejected) return rejected;
  const limited = enforceRateLimit(request, "session-exchange", 8, 160);
  if (limited) return limited;

  try {
    const input = (await readJsonWithLimit(request, 8_192)) as Record<
      string,
      unknown
    >;
    if (
      !input ||
      typeof input !== "object" ||
      typeof input.challenge !== "string" ||
      typeof input.counter !== "number"
    ) {
      throw new ApiSecurityError(400, "Verificação de segurança inválida.");
    }
    return securityJson(
      request,
      await exchangeChallenge(request, input.challenge, input.counter),
    );
  } catch (error) {
    if (error instanceof ApiSecurityError) {
      return securityJson(request, { error: error.message }, error.status);
    }
    return securityJson(request, { error: "A verificação segura falhou." }, 500);
  }
}
