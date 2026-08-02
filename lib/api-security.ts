import { env } from "cloudflare:workers";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const sitesOrigin =
  "https://grade-computacao-uabj-2026.linuxpenguin12362015.chatgpt.site";
const allowedOrigins = new Set([
  "https://laginh0.github.io",
  sitesOrigin,
]);

const challengeLifetimeSeconds = 90;
const sessionLifetimeSeconds = 10 * 60;
export const proofDifficulty = 15;

type SignedChallenge = {
  v: 1;
  kind: "challenge";
  nonce: string;
  origin: string;
  client: string;
  issuedAt: number;
  expiresAt: number;
};

type SignedSession = {
  v: 1;
  kind: "session";
  audience: "share-codes";
  nonce: string;
  origin: string;
  client: string;
  issuedAt: number;
  expiresAt: number;
};

type RateBucket = {
  count: number;
  resetsAt: number;
};

const rateBuckets = new Map<string, RateBucket>();
let hmacKeyPromise: Promise<CryptoKey> | null = null;

export class ApiSecurityError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

const getSecret = () => {
  const value = (env as unknown as Record<string, unknown>)[
    "SHARE_SECURITY_SECRET"
  ];
  if (typeof value !== "string" || value.length < 32) {
    throw new ApiSecurityError(503, "A proteção do servidor está indisponível.");
  }
  return value;
};

const bytesToBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const base64UrlToBytes = (value: string) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const hmac = async (value: string) => {
  hmacKeyPromise ??= crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", await hmacKeyPromise, encoder.encode(value)),
  );
};

const safeEqual = (first: string, second: string) => {
  if (first.length !== second.length) return false;
  let difference = 0;
  for (let index = 0; index < first.length; index += 1) {
    difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
  }
  return difference === 0;
};

const signObject = async (value: SignedChallenge | SignedSession) => {
  const payload = bytesToBase64Url(encoder.encode(JSON.stringify(value)));
  const signature = bytesToBase64Url(await hmac(payload));
  return `${payload}.${signature}`;
};

const readSignedObject = async <T>(token: string): Promise<T | null> => {
  if (token.length > 4096) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = bytesToBase64Url(await hmac(payload));
  if (!safeEqual(signature, expected)) return null;
  try {
    return JSON.parse(decoder.decode(base64UrlToBytes(payload))) as T;
  } catch {
    return null;
  }
};

const clientIp = (request: Request) =>
  request.headers.get("cf-connecting-ip")?.trim() || "unknown";

const clientBinding = async (request: Request) =>
  bytesToBase64Url(await hmac(`client:${clientIp(request)}`)).slice(0, 24);

export const requestOrigin = (request: Request) => {
  const fetchMode = request.headers.get("sec-fetch-mode");
  const fetchDestination = request.headers.get("sec-fetch-dest");
  const fetchSite = request.headers.get("sec-fetch-site");
  const isWebsiteFetch =
    fetchMode === "cors" &&
    fetchDestination === "empty" &&
    (fetchSite === "cross-site" || fetchSite === "same-origin");
  if (!isWebsiteFetch) return null;

  const origin = request.headers.get("origin")?.trim() ?? "";
  if (allowedOrigins.has(origin)) return origin;

  const isSameOriginBrowserRequest =
    !origin &&
    fetchSite === "same-origin" &&
    new URL(request.url).origin === sitesOrigin;
  return isSameOriginBrowserRequest ? sitesOrigin : null;
};

export const responseHeaders = (
  origin: string | null,
  cacheControl = "no-store",
) => ({
  ...(origin ? { "Access-Control-Allow-Origin": origin } : {}),
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Max-Age": "600",
  "Cache-Control": cacheControl,
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  Vary: "Origin",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
});

export const securityJson = (
  request: Request,
  body: unknown,
  status = 200,
  cacheControl = "no-store",
) =>
  Response.json(body, {
    status,
    headers: responseHeaders(requestOrigin(request), cacheControl),
  });

export const requireAllowedOrigin = (request: Request) => {
  if (requestOrigin(request)) return null;
  return securityJson(
    request,
    { error: "Origem não autorizada." },
    403,
  );
};

export const optionsResponse = (request: Request) => {
  const rejected = requireAllowedOrigin(request);
  return rejected ?? new Response(null, {
    status: 204,
    headers: responseHeaders(requestOrigin(request)),
  });
};

const consumeRateBucket = (
  key: string,
  maximum: number,
  windowMilliseconds: number,
) => {
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || existing.resetsAt <= now) {
    rateBuckets.set(key, { count: 1, resetsAt: now + windowMilliseconds });
    return { allowed: true, retryAfter: 0 };
  }
  existing.count += 1;
  return {
    allowed: existing.count <= maximum,
    retryAfter: Math.max(1, Math.ceil((existing.resetsAt - now) / 1000)),
  };
};

export const enforceRateLimit = (
  request: Request,
  scope: string,
  perClient: number,
  global: number,
  windowMilliseconds = 60_000,
) => {
  if (rateBuckets.size > 5_000) {
    const now = Date.now();
    for (const [key, bucket] of rateBuckets) {
      if (bucket.resetsAt <= now) rateBuckets.delete(key);
    }
    let excess = rateBuckets.size - 4_000;
    for (const key of rateBuckets.keys()) {
      if (excess <= 0) break;
      rateBuckets.delete(key);
      excess -= 1;
    }
  }

  const clientResult = consumeRateBucket(
    `${scope}:client:${clientIp(request)}`,
    perClient,
    windowMilliseconds,
  );
  const globalResult = consumeRateBucket(
    `${scope}:global`,
    global,
    windowMilliseconds,
  );
  if (clientResult.allowed && globalResult.allowed) return null;

  const retryAfter = Math.max(
    clientResult.retryAfter,
    globalResult.retryAfter,
  );
  return Response.json(
    { error: "Muitas tentativas. Aguarde um pouco e tente novamente." },
    {
      status: 429,
      headers: {
        ...responseHeaders(requestOrigin(request)),
        "Retry-After": String(retryAfter),
      },
    },
  );
};

export const readJsonWithLimit = async (
  request: Request,
  maximumBytes: number,
) => {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maximumBytes) {
    throw new ApiSecurityError(413, "A requisição enviada é muito grande.");
  }
  if (!request.body) throw new ApiSecurityError(400, "Requisição inválida.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      throw new ApiSecurityError(413, "A requisição enviada é muito grande.");
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(decoder.decode(body)) as unknown;
  } catch {
    throw new ApiSecurityError(400, "JSON inválido.");
  }
};

const hasLeadingZeroBits = (digest: Uint8Array, difficulty: number) => {
  const wholeBytes = Math.floor(difficulty / 8);
  const remainingBits = difficulty % 8;
  for (let index = 0; index < wholeBytes; index += 1) {
    if (digest[index] !== 0) return false;
  }
  if (remainingBits === 0) return true;
  return (digest[wholeBytes] & (0xff << (8 - remainingBits))) === 0;
};

export const createChallenge = async (request: Request) => {
  const now = Math.floor(Date.now() / 1000);
  const nonce = new Uint8Array(18);
  crypto.getRandomValues(nonce);
  const origin = requestOrigin(request);
  if (!origin) throw new ApiSecurityError(403, "Origem não autorizada.");

  const challenge: SignedChallenge = {
    v: 1,
    kind: "challenge",
    nonce: bytesToBase64Url(nonce),
    origin,
    client: await clientBinding(request),
    issuedAt: now,
    expiresAt: now + challengeLifetimeSeconds,
  };
  return {
    challenge: await signObject(challenge),
    difficulty: proofDifficulty,
    expiresAt: challenge.expiresAt,
  };
};

export const exchangeChallenge = async (
  request: Request,
  challengeToken: string,
  counter: number,
) => {
  const challenge = await readSignedObject<SignedChallenge>(challengeToken);
  const origin = requestOrigin(request);
  const now = Math.floor(Date.now() / 1000);
  if (
    !challenge ||
    challenge.v !== 1 ||
    challenge.kind !== "challenge" ||
    challenge.origin !== origin ||
    challenge.client !== (await clientBinding(request)) ||
    challenge.expiresAt < now ||
    challenge.issuedAt > now + 5 ||
    !Number.isSafeInteger(counter) ||
    counter < 0 ||
    counter > 10_000_000
  ) {
    throw new ApiSecurityError(401, "Verificação de segurança inválida.");
  }

  const proof = new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(`${challengeToken}.${counter}`),
    ),
  );
  if (!hasLeadingZeroBits(proof, proofDifficulty)) {
    throw new ApiSecurityError(401, "Verificação de segurança inválida.");
  }

  const session: SignedSession = {
    v: 1,
    kind: "session",
    audience: "share-codes",
    nonce: challenge.nonce,
    origin: challenge.origin,
    client: challenge.client,
    issuedAt: now,
    expiresAt: now + sessionLifetimeSeconds,
  };
  return {
    token: await signObject(session),
    expiresAt: session.expiresAt,
  };
};

export const requireApiSession = async (request: Request) => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return securityJson(request, { error: "Sessão segura obrigatória." }, 401);
  }

  const session = await readSignedObject<SignedSession>(authorization.slice(7));
  const now = Math.floor(Date.now() / 1000);
  if (
    !session ||
    session.v !== 1 ||
    session.kind !== "session" ||
    session.audience !== "share-codes" ||
    session.origin !== requestOrigin(request) ||
    session.client !== (await clientBinding(request)) ||
    session.expiresAt < now ||
    session.issuedAt > now + 5
  ) {
    return securityJson(request, { error: "Sessão segura inválida ou expirada." }, 401);
  }
  return null;
};

let encryptionKeyPromise: Promise<CryptoKey> | null = null;

const encryptionKey = () => {
  encryptionKeyPromise ??= (async () => {
    const keyBytes = await crypto.subtle.digest(
      "SHA-256",
      encoder.encode(`shared-grades-at-rest:${getSecret()}`),
    );
    return crypto.subtle.importKey(
      "raw",
      keyBytes,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  })();
  return encryptionKeyPromise;
};

export const encryptStoredPayload = async (plaintext: string) => {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv,
        additionalData: encoder.encode("shared-grade:v1"),
      },
      await encryptionKey(),
      encoder.encode(plaintext),
    ),
  );
  return `enc:v1:${bytesToBase64Url(iv)}:${bytesToBase64Url(ciphertext)}`;
};

export const decryptStoredPayload = async (stored: string) => {
  if (!stored.startsWith("enc:v1:")) {
    return { plaintext: stored, wasLegacyPlaintext: true };
  }
  const [prefix, version, encodedIv, encodedCiphertext, extra] = stored.split(":");
  if (
    prefix !== "enc" ||
    version !== "v1" ||
    !encodedIv ||
    !encodedCiphertext ||
    extra
  ) {
    throw new ApiSecurityError(500, "O conteúdo armazenado é inválido.");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64UrlToBytes(encodedIv),
        additionalData: encoder.encode("shared-grade:v1"),
      },
      await encryptionKey(),
      base64UrlToBytes(encodedCiphertext),
    );
    return {
      plaintext: decoder.decode(plaintext),
      wasLegacyPlaintext: false,
    };
  } catch {
    throw new ApiSecurityError(500, "Não foi possível abrir o conteúdo protegido.");
  }
};
