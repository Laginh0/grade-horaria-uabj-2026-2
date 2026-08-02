"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { prerequisiteIds, prerequisiteNotes } from "./data/prerequisites";

type ClassTime = {
  day: number;
  start: number;
  end: number;
  room?: string;
  professor?: string;
};

type CourseOffering = {
  id: string;
  professor: string;
  room: string;
  label?: string;
  times: ClassTime[];
};

type Discipline = {
  id: string;
  period: string;
  name: string;
  professor: string;
  room: string;
  color: number;
  times: ClassTime[];
  offerings?: CourseOffering[];
};

type DisplayEvent = ClassTime & {
  discipline: Discipline;
  key: string;
};

type CatalogTab = "all" | "completed" | "eligible" | "conflict-free";

type SavedListState = {
  version?: number;
  selectedIds?: string[];
  completedIds?: string[];
  selectedOfferingIds?: Record<string, string>;
  catalogTab?: CatalogTab;
};

const progressStorageKey = "grade-uabj-2026-2";
const progressCookieName = "grade_uabj_2026_2";
const cookieLifetimeSeconds = 60 * 60 * 24 * 365;
const sharingApiUrl =
  "https://grade-computacao-uabj-2026.linuxpenguin12362015.chatgpt.site/api/share-codes";
const securitySessionUrl =
  "https://grade-computacao-uabj-2026.linuxpenguin12362015.chatgpt.site/api/security/session";

let sharingSessionToken = "";
let sharingSessionExpiresAt = 0;
let sharingSessionPromise: Promise<string> | null = null;

const digestHasLeadingZeroBits = (digest: Uint8Array, difficulty: number) => {
  const wholeBytes = Math.floor(difficulty / 8);
  const remainingBits = difficulty % 8;
  for (let index = 0; index < wholeBytes; index += 1) {
    if (digest[index] !== 0) return false;
  }
  if (remainingBits === 0) return true;
  return (digest[wholeBytes] & (0xff << (8 - remainingBits))) === 0;
};

const solveSecurityChallenge = async (
  challenge: string,
  difficulty: number,
) => {
  if (!window.isSecureContext || !window.crypto?.subtle) {
    throw new Error("Abra o site oficial usando uma conexão HTTPS.");
  }
  if (!Number.isInteger(difficulty) || difficulty < 8 || difficulty > 20) {
    throw new Error("O servidor enviou uma verificação inválida.");
  }

  const encoder = new TextEncoder();
  const batchSize = 64;
  const maximumCounter = 2_000_000;
  for (let batchStart = 0; batchStart < maximumCounter; batchStart += batchSize) {
    const counters = Array.from(
      { length: batchSize },
      (_, index) => batchStart + index,
    );
    const digests = await Promise.all(
      counters.map(async (counter) =>
        new Uint8Array(
          await window.crypto.subtle.digest(
            "SHA-256",
            encoder.encode(`${challenge}.${counter}`),
          ),
        ),
      ),
    );
    const matchIndex = digests.findIndex((digest) =>
      digestHasLeadingZeroBits(digest, difficulty),
    );
    if (matchIndex >= 0) return counters[matchIndex];
    if (batchStart % 4_096 === 0) {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    }
  }
  throw new Error("Não foi possível concluir a verificação segura.");
};

const createSharingSession = async () => {
  const challengeResponse = await fetch(securitySessionUrl, {
    cache: "no-store",
  });
  const challengeResult = (await challengeResponse.json()) as {
    challenge?: string;
    difficulty?: number;
    error?: string;
  };
  if (
    !challengeResponse.ok ||
    !challengeResult.challenge ||
    typeof challengeResult.difficulty !== "number"
  ) {
    throw new Error(
      challengeResult.error ?? "Não foi possível verificar o site oficial.",
    );
  }

  const counter = await solveSecurityChallenge(
    challengeResult.challenge,
    challengeResult.difficulty,
  );
  const sessionResponse = await fetch(securitySessionUrl, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ challenge: challengeResult.challenge, counter }),
  });
  const sessionResult = (await sessionResponse.json()) as {
    token?: string;
    expiresAt?: number;
    error?: string;
  };
  if (
    !sessionResponse.ok ||
    !sessionResult.token ||
    typeof sessionResult.expiresAt !== "number"
  ) {
    throw new Error(
      sessionResult.error ?? "A sessão segura não pôde ser criada.",
    );
  }
  sharingSessionToken = sessionResult.token;
  sharingSessionExpiresAt = sessionResult.expiresAt;
  return sharingSessionToken;
};

const getSharingSession = async (forceRefresh = false) => {
  const now = Math.floor(Date.now() / 1000);
  if (
    !forceRefresh &&
    sharingSessionToken &&
    sharingSessionExpiresAt > now + 30
  ) {
    return sharingSessionToken;
  }
  if (!sharingSessionPromise || forceRefresh) {
    sharingSessionPromise = createSharingSession().finally(() => {
      sharingSessionPromise = null;
    });
  }
  return sharingSessionPromise;
};

const secureSharingFetch = async (
  url: string,
  init: RequestInit = {},
  canRetry = true,
): Promise<Response> => {
  const token = await getSharingSession();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers, cache: "no-store" });
  if (response.status === 401 && canRetry) {
    sharingSessionToken = "";
    sharingSessionExpiresAt = 0;
    await getSharingSession(true);
    return secureSharingFetch(url, init, false);
  }
  return response;
};

const readProgressCookie = () => {
  if (typeof document === "undefined") return null;
  const prefix = `${progressCookieName}=`;
  const value = document.cookie
    .split("; ")
    .find((cookie) => cookie.startsWith(prefix))
    ?.slice(prefix.length);
  return value ? decodeURIComponent(value) : null;
};

const writeProgressCookie = (value: string) => {
  if (typeof document === "undefined") return false;
  try {
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${progressCookieName}=${encodeURIComponent(value)}; Max-Age=${cookieLifetimeSeconds}; Path=/; SameSite=Lax${secure}`;
    return document.cookie
      .split("; ")
      .some((cookie) => cookie.startsWith(`${progressCookieName}=`));
  } catch {
    return false;
  }
};

const clearProgressCookie = () => {
  if (typeof document === "undefined") return;
  try {
    document.cookie = `${progressCookieName}=; Max-Age=0; Path=/; SameSite=Lax`;
  } catch {
    // O armazenamento local continua disponível quando cookies são bloqueados.
  }
};

const days = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta"];
const shortDays = ["seg", "ter", "qua", "qui", "sex"];
const hours = Array.from({ length: 12 }, (_, index) => index + 7);

const t = (
  day: number,
  start: number,
  end: number,
  room?: string,
  professor?: string,
): ClassTime => ({ day, start, end, room, professor });

const rawDisciplines: Omit<Discipline, "color">[] = [
  {
    id: "calculo-1",
    period: "1º período",
    name: "Cálculo 1",
    professor: "Roy Guarniz",
    room: "AEB-04B",
    offerings: [
      {
        id: "roy-guarniz",
        professor: "Roy Guarniz",
        room: "AEB-04B",
        times: [t(0, 10, 12), t(2, 10, 12)],
      },
      {
        id: "eber-vizarreta",
        professor: "Eber Vizarreta",
        room: "AEB-02C",
        times: [t(0, 8, 10), t(2, 10, 12)],
      },
      {
        id: "jose-ramos",
        professor: "José Ramos dos Santos",
        room: "AEB-02B",
        times: [t(0, 10, 12), t(2, 10, 12)],
      },
    ],
    times: [t(0, 10, 12), t(2, 10, 12)],
  },
  {
    id: "geometria-analitica",
    period: "1º período",
    name: "Geometria Analítica",
    professor: "Rebeka Domingues",
    room: "AEB-03B",
    offerings: [
      {
        id: "rebeka-computacao",
        professor: "Rebeka Domingues",
        room: "AEB-03B",
        label: "Turma da Computação",
        times: [t(0, 13, 16)],
      },
      {
        id: "rebeka-compartilhada",
        professor: "Rebeka Domingues",
        room: "AEB-03B",
        label: "Turma compartilhada",
        times: [t(1, 10, 13)],
      },
      {
        id: "mauri-pereira",
        professor: "Mauri Pereira",
        room: "AEB-05B",
        times: [t(0, 10, 13)],
      },
    ],
    times: [t(0, 13, 16)],
  },
  {
    id: "matematica-discreta-1",
    period: "1º período",
    name: "Matemática Discreta 1",
    professor: "Ranieri Freire",
    room: "AEB-01C",
    times: [t(0, 16, 18), t(1, 16, 18)],
  },
  {
    id: "fisica-1",
    period: "1º período",
    name: "Física 1",
    professor: "Elaine Oliveira da Silva",
    room: "AEB-05C",
    offerings: [
      {
        id: "elaine-oliveria",
        professor: "Elaine Oliveria da Silva",
        room: "AEB-05C",
        times: [t(1, 10, 12), t(2, 8, 10)],
      },
      {
        id: "nathan-pessoa",
        professor: "Nathan Pessoa",
        room: "AEB-08B",
        times: [t(1, 10, 12), t(2, 8, 10)],
      },
      {
        id: "fabio-novaes",
        professor: "Fábio Novaes",
        room: "AEB-03B",
        times: [t(1, 8, 10), t(2, 8, 10)],
      },
    ],
    times: [t(1, 10, 12), t(2, 8, 10)],
  },
  {
    id: "introducao-engenharia-computacao",
    period: "1º período",
    name: "Introdução à Engenharia da Computação",
    professor: "Waldemar Neto",
    room: "AEB-07B",
    times: [t(1, 13, 16)],
  },
  {
    id: "ingles-1",
    period: "1º período",
    name: "Inglês 1",
    professor: "Saulo Brandão",
    room: "AVA-EaD / sala não informada",
    times: [t(3, 14, 16, "AVA-EaD"), t(4, 14, 16, "Sala não informada")],
  },
  {
    id: "programacao-1",
    period: "1º período",
    name: "Programação 1",
    professor: "Docente em contratação (DEINFO)",
    room: "AEB-04C",
    offerings: [
      {
        id: "deinfo-contratacao",
        professor: "Docente em contratação (DEINFO)",
        room: "AEB-04C",
        times: [t(3, 16, 18), t(4, 16, 18)],
      },
      {
        id: "camila-ascendina",
        professor: "Camila Ascendina",
        room: "AEB-04C",
        times: [t(0, 14, 16), t(1, 14, 16)],
      },
    ],
    times: [t(3, 16, 18), t(4, 16, 18)],
  },
  {
    id: "metodologia-cientifica",
    period: "1º período",
    name: "Metodologia Científica",
    professor: "Bruna Thorpe",
    room: "AVA-EaD",
    times: [t(4, 8, 10)],
  },
  {
    id: "matematica-discreta-2",
    period: "2º período",
    name: "Matemática Discreta 2",
    professor: "Ranieri Freire",
    room: "AEB-01C",
    times: [t(0, 8, 10), t(2, 8, 10)],
  },
  {
    id: "calculo-2",
    period: "2º período",
    name: "Cálculo 2",
    professor: "Roy Guarniz",
    room: "AEB-04B",
    offerings: [
      {
        id: "roy-guarniz",
        professor: "Roy Guarniz",
        room: "AEB-04B",
        times: [t(0, 14, 16), t(2, 14, 16)],
      },
      {
        id: "mauri-pereira",
        professor: "Mauri Pereira",
        room: "AEB-04B",
        times: [t(0, 8, 10), t(1, 10, 12)],
      },
    ],
    times: [t(0, 14, 16), t(2, 14, 16)],
  },
  {
    id: "algebra-linear",
    period: "2º período",
    name: "Álgebra Linear",
    professor: "Mauri Pereira",
    room: "AEB-05B",
    offerings: [
      {
        id: "mauri-pereira",
        professor: "Mauri Pereira",
        room: "AEB-05B",
        times: [t(0, 16, 18), t(1, 16, 18)],
      },
      {
        id: "eber-vizarreta",
        professor: "Eber Vizarreta",
        room: "AEB-02C",
        times: [t(0, 10, 12), t(2, 8, 10)],
      },
    ],
    times: [t(0, 16, 18), t(1, 16, 18)],
  },
  {
    id: "fisica-2",
    period: "2º período",
    name: "Física 2",
    professor: "Elaine Oliveira da Silva",
    room: "AEB-05C",
    offerings: [
      {
        id: "elaine-oliveria",
        professor: "Elaine Oliveria da Silva",
        room: "AEB-05C",
        times: [t(1, 8, 10), t(2, 10, 12)],
      },
      {
        id: "nathan-pessoa",
        professor: "Nathan Pessoa",
        room: "AEB-08B",
        times: [t(1, 14, 16), t(3, 14, 16)],
      },
    ],
    times: [t(1, 8, 10), t(2, 10, 12)],
  },
  {
    id: "programacao-2",
    period: "2º período",
    name: "Programação 2",
    professor: "Michael Cruz",
    room: "AEB-07C",
    times: [t(3, 8, 10), t(4, 8, 10)],
  },
  {
    id: "ingles-2",
    period: "2º período",
    name: "Inglês 2",
    professor: "Saulo Brandão",
    room: "AEB-02B",
    times: [t(3, 10, 12), t(4, 10, 12)],
  },
  {
    id: "metodologia-trabalho-cientifico",
    period: "2º período",
    name: "Metodologia do Trabalho Científico",
    professor: "Bruna Thorpe",
    room: "AEB-03B",
    times: [t(3, 16, 18), t(4, 16, 18)],
  },
  {
    id: "calculo-3",
    period: "3º período",
    name: "Cálculo 3",
    professor: "José Ramos dos Santos",
    room: "AEB-02B",
    times: [t(0, 8, 10), t(2, 8, 10)],
  },
  {
    id: "estatistica-probabilidade",
    period: "3º período",
    name: "Estatística e Probabilidade",
    professor: "Ranieri Freire",
    room: "AEB-01C",
    times: [t(0, 10, 12), t(1, 10, 12)],
  },
  {
    id: "sistemas-digitais",
    period: "3º período",
    name: "Sistemas Digitais",
    professor: "Camila Ascendina",
    room: "AEB-04C",
    offerings: [
      {
        id: "camila-ascendina",
        professor: "Camila Ascendina",
        room: "AEB-04C",
        times: [t(1, 8, 10), t(2, 10, 12)],
      },
      {
        id: "henrique-patriota",
        professor: "Henrique Patriota",
        room: "AEB-07B",
        times: [t(0, 16, 18), t(1, 16, 18)],
      },
    ],
    times: [t(1, 8, 10), t(2, 10, 12)],
  },
  {
    id: "fisica-3",
    period: "3º período",
    name: "Física 3 (1)",
    professor: "Elaine Oliveira da Silva",
    room: "AEB-02B",
    offerings: [
      {
        id: "elaine-oliveria",
        professor: "Elaine Oliveria da Silva",
        room: "AEB-02B",
        times: [t(1, 16, 18), t(2, 16, 18)],
      },
      {
        id: "fabio-novaes",
        professor: "Fábio Novaes",
        room: "AEB-01C",
        times: [t(2, 10, 12), t(3, 10, 12)],
      },
    ],
    times: [t(1, 16, 18), t(2, 16, 18)],
  },
  {
    id: "algoritmos-estrutura-dados",
    period: "3º período",
    name: "Algoritmos e Estruturas de Dados",
    professor: "Waldemar Neto",
    room: "AEB-06B",
    times: [t(2, 14, 16), t(3, 16, 18)],
  },
  {
    id: "ingles-3",
    period: "3º período",
    name: "Inglês 3",
    professor: "Bruna Thorpe",
    room: "AEB-03B",
    times: [t(3, 14, 16), t(4, 14, 16)],
  },
  {
    id: "projeto-interdisciplinar-1",
    period: "3º período",
    name: "Projeto Interdisciplinar em Engenharia de Computação 1",
    professor: "Docente em contratação (DEINFO)",
    room: "AEB-04C",
    times: [t(4, 10, 13)],
  },
  {
    id: "projeto-interdisciplinar-2",
    period: "4º período",
    name: "Projeto Interdisciplinar em Engenharia de Computação 2",
    professor: "Docente em contratação (UAST)",
    room: "AEB-05C",
    times: [t(0, 10, 13)],
  },
  {
    id: "calculo-numerico",
    period: "4º período",
    name: "Cálculo Numérico",
    professor: "Rebeka Domingues",
    room: "AEB-03B",
    times: [t(0, 16, 18), t(1, 14, 16)],
  },
  {
    id: "circuitos-eletricos-1",
    period: "4º período",
    name: "Circuitos Elétricos 1",
    professor: "Ana Paula (em contratação)",
    room: "AEB-06C",
    offerings: [
      {
        id: "ana-paula",
        professor: "Ana Paula (em contratação)",
        room: "AEB-06C",
        times: [t(2, 16, 18), t(3, 16, 18), t(4, 8, 10)],
      },
      {
        id: "egydio-tadeu",
        professor: "Egydio Tadeu",
        room: "AEB-02A",
        times: [t(2, 16, 18), t(3, 16, 18), t(4, 8, 10)],
      },
    ],
    times: [t(2, 16, 18), t(3, 16, 18), t(4, 8, 10)],
  },
  {
    id: "redes-computadores",
    period: "4º período",
    name: "Redes de Computadores",
    professor: "Ygor Amaral",
    room: "AEB-03C",
    times: [t(3, 10, 12), t(4, 10, 12)],
  },
  {
    id: "arquitetura-computadores",
    period: "4º período",
    name: "Arquitetura de Computadores",
    professor: "Docente em contratação (DEINFO)",
    room: "AEB-04C",
    times: [t(3, 14, 16), t(4, 14, 16)],
  },
  {
    id: "gestao-ambiental",
    period: "4º período",
    name: "Gestão Ambiental",
    professor: "Juliana Rodrigues",
    room: "AVA-EaD",
    times: [t(4, 16, 18)],
  },
  {
    id: "projeto-redes-computadores",
    period: "5º período",
    name: "Projeto de Redes de Computadores",
    professor: "Jaqueline Silva",
    room: "AEB-04C",
    times: [t(0, 10, 12), t(1, 10, 12)],
  },
  {
    id: "banco-dados",
    period: "5º período",
    name: "Banco de Dados",
    professor: "Anderson Cavalcanti",
    room: "AEB-07C",
    times: [t(0, 14, 16), t(1, 14, 16)],
  },
  {
    id: "planejamento-projetos",
    period: "5º período",
    name: "Planejamento e Gerenciamento de Projetos",
    professor: "Docente em contratação (UAST)",
    room: "AEB-08C",
    times: [t(0, 16, 18), t(1, 16, 18)],
  },
  {
    id: "analise-desempenho",
    period: "5º período",
    name: "Análise de Desempenho",
    professor: "Docente em contratação (DEINFO)",
    room: "AEB-04C",
    times: [t(3, 8, 10), t(4, 8, 10)],
  },
  {
    id: "projeto-interdisciplinar-3",
    period: "5º período",
    name: "Projeto Interdisciplinar em Engenharia de Computação 3",
    professor: "Michael Cruz",
    room: "AEB-07C",
    times: [t(3, 10, 13)],
  },
  {
    id: "seguranca-informacao",
    period: "5º período",
    name: "Segurança da Informação",
    professor: "Ygor Amaral",
    room: "AEB-03C",
    times: [t(3, 14, 16), t(4, 14, 16)],
  },
  {
    id: "sistemas-operacionais",
    period: "5º período",
    name: "Sistemas Operacionais",
    professor: "Michael Cruz",
    room: "AEB-07C",
    times: [t(3, 16, 18), t(4, 16, 18)],
  },
  {
    id: "seguranca-saude-trabalho",
    period: "6º período",
    name: "Segurança e Saúde do Trabalho",
    professor: "Silvanete Silva",
    room: "Sala não informada",
    times: [t(4, 10, 12)],
  },
  {
    id: "legislacao-engenharia",
    period: "6º período",
    name: "Legislação para Engenharia",
    professor: "Yumara Vasconcelos",
    room: "AVA-EaD",
    times: [t(4, 14, 16)],
  },
  {
    id: "eletronica-1",
    period: "7º período",
    name: "Eletrônica 1",
    professor: "Ailton Egito",
    room: "AEB-03C",
    times: [t(0, 16, 18), t(1, 14, 16), t(1, 16, 18)],
  },
  {
    id: "dispositivos-eletronicos",
    period: "7º período",
    name: "Dispositivos Eletrônicos",
    professor: "Sabi Bandiri",
    room: "AEB-08C",
    times: [t(1, 10, 12), t(2, 10, 12)],
  },
  {
    id: "engenharia-software",
    period: "7º período",
    name: "Engenharia de Software",
    professor: "Waldemar Neto",
    room: "AEB-06B",
    times: [t(2, 8, 10), t(3, 8, 10)],
  },
  {
    id: "eletromagnetismo",
    period: "7º período",
    name: "Eletromagnetismo",
    professor: "Nathan Pessoa",
    room: "AEB-03C",
    times: [t(2, 16, 18), t(3, 16, 18)],
  },
  {
    id: "teoria-computacao",
    period: "7º período",
    name: "Teoria da Computação",
    professor: "Denini Silva",
    room: "AEB-02C",
    times: [t(3, 10, 12), t(4, 8, 10)],
  },
  {
    id: "sinais-sistemas",
    period: "7º período",
    name: "Sinais e Sistemas",
    professor: "Ivan Silva",
    room: "AEB-02C",
    times: [t(3, 14, 16), t(4, 14, 16)],
  },
  {
    id: "projeto-interdisciplinar-4",
    period: "7º período",
    name: "Projeto Interdisciplinar em Engenharia de Computação 4",
    professor: "Denini Silva",
    room: "AEB-02C",
    times: [t(4, 10, 13)],
  },
  {
    id: "inteligencia-artificial",
    period: "8º período",
    name: "Inteligência Artificial",
    professor: "Anderson Cavalcanti",
    room: "AEB-07C",
    times: [t(0, 10, 12), t(1, 10, 12)],
  },
  {
    id: "paradigmas-programacao",
    period: "8º período",
    name: "Paradigmas de Programação",
    professor: "Docente em contratação (UAST)",
    room: "AEB-05C",
    times: [t(0, 14, 16), t(1, 14, 16)],
  },
  {
    id: "servomecanismos",
    period: "8º período",
    name: "Servomecanismos",
    professor: "André Barbosa",
    room: "AEB-04B",
    times: [t(0, 16, 18), t(1, 16, 18)],
  },
  {
    id: "principios-comunicacao",
    period: "8º período",
    name: "Princípios da Comunicação",
    professor: "Sabi Bandiri",
    room: "AEB-08C",
    times: [t(1, 8, 10), t(2, 8, 10)],
  },
  {
    id: "compiladores",
    period: "8º período",
    name: "Compiladores",
    professor: "Denini Silva",
    room: "AEB-06C",
    times: [t(3, 14, 16), t(4, 14, 16)],
  },
  {
    id: "co-desenvolvimento-hw-sw",
    period: "9º período",
    name: "Projeto de Co-Desenvolvimento HW/SW",
    professor: "Camila Ascendina e Jaqueline Silva",
    room: "AEB-04C / sala não informada",
    offerings: [
      {
        id: "camila-ascendina",
        professor: "Camila Ascendina",
        room: "AEB-04C",
        times: [t(0, 16, 18), t(1, 16, 18)],
      },
      {
        id: "jaqueline-silva",
        professor: "Jaqueline Silva",
        room: "Sala não informada",
        times: [t(4, 14, 16), t(4, 16, 18)],
      },
    ],
    times: [
      t(0, 16, 18, "AEB-04C", "Camila Ascendina"),
      t(1, 16, 18, "AEB-04C", "Camila Ascendina"),
      t(4, 14, 16, "Sala não informada", "Jaqueline Silva"),
      t(4, 16, 18, "Sala não informada", "Jaqueline Silva"),
    ],
  },
  {
    id: "projeto-conclusao-curso",
    period: "9º período",
    name: "Projeto de Conclusão de Curso em Engenharia da Computação",
    professor: "Waldemar Neto",
    room: "AEB-06B",
    times: [t(2, 16, 18), t(3, 14, 16)],
  },
  {
    id: "barragem-terra",
    period: "Optativa 1",
    name: "Barragem de Terra",
    professor: "Lara Mendes",
    room: "AEB-06A",
    times: [t(0, 8, 10), t(1, 8, 10)],
  },
  {
    id: "gestao-residuos-solidos",
    period: "Optativa 1",
    name: "Gestão e Manejo de Resíduos Sólidos",
    professor: "Thais Póvoas",
    room: "AEB-09A",
    times: [t(0, 10, 12), t(1, 10, 12)],
  },
  {
    id: "complementos-matematica",
    period: "Optativa 1",
    name: "Complementos de Matemática",
    professor: "Eber Vizarreta",
    room: "AEB-02C",
    times: [t(0, 14, 16), t(2, 14, 16)],
  },
  {
    id: "topicos-biologia",
    period: "Optativa 1",
    name: "Tópicos em Biologia",
    professor: "Edipo Silva",
    room: "AEB-04B",
    times: [t(2, 16, 18), t(4, 16, 18)],
  },
  {
    id: "mineracao-texto",
    period: "Optativa 2",
    name: "Mineração de Texto (em criação)",
    professor: "Anderson Cavalcanti",
    room: "AEB-07C",
    times: [t(0, 16, 18), t(1, 16, 18)],
  },
  {
    id: "educacao-relacoes-etnicas-raciais",
    period: "Optativa 2",
    name: "Educação das Relações Étnicas Raciais",
    professor: "Sabi Bandiri",
    room: "AEB-08C",
    times: [t(1, 14, 16), t(2, 14, 16)],
  },
  {
    id: "computacao-evolucionaria",
    period: "Optativa 2",
    name: "Computação Evolucionária (em criação)",
    professor: "Ygor Amaral",
    room: "AEB-02B",
    times: [t(3, 16, 18), t(4, 16, 18)],
  },
  {
    id: "matematica-elementar",
    period: "Optativa 3",
    name: "Matemática Elementar",
    professor: "Ranieri Freire",
    room: "AEB-01C",
    times: [t(1, 14, 16), t(2, 14, 16)],
  },
  {
    id: "drenagem-urbana",
    period: "Optativa 3",
    name: "Drenagem Urbana",
    professor: "Sabrina Correia",
    room: "AEB-04A",
    times: [t(2, 16, 18), t(3, 16, 18)],
  },
];

const disciplines: Discipline[] = rawDisciplines.map((discipline, index) => ({
  ...discipline,
  color: Math.round((index * 137.508 + 204) % 360),
}));

const periodOrder = [
  "1º período",
  "2º período",
  "3º período",
  "4º período",
  "5º período",
  "6º período",
  "7º período",
  "8º período",
  "9º período",
  "Optativa 1",
  "Optativa 2",
  "Optativa 3",
];

const formatHour = (hour: number) => `${hour}h`;

const formatTimes = (times: ClassTime[]) =>
  times
    .map((time) => `${shortDays[time.day]} ${time.start}–${time.end}h`)
    .join(" · ");

const getOffering = (discipline: Discipline, offeringId?: string) =>
  discipline.offerings?.find((offering) => offering.id === offeringId) ??
  discipline.offerings?.[0];

export default function Home() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [isHydrated, setIsHydrated] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [isThemeHydrated, setIsThemeHydrated] = useState(false);
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("all");
  const [selectedOfferingIds, setSelectedOfferingIds] = useState<
    Record<string, string>
  >({});
  const [pendingDisciplineId, setPendingDisciplineId] = useState<string | null>(
    null,
  );
  const [autosaveStatus, setAutosaveStatus] = useState("Autosave ativo");
  const [fileMessage, setFileMessage] = useState("");
  const [cloudCodeInput, setCloudCodeInput] = useState("");
  const [generatedCloudCode, setGeneratedCloudCode] = useState("");
  const [cloudMessage, setCloudMessage] = useState("");
  const [isCloudBusy, setIsCloudBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem("grade-uabj-theme");
      const preferredTheme = window.matchMedia("(prefers-color-scheme: dark)")
        .matches
        ? "dark"
        : "light";
      setTheme(
        storedTheme === "dark" || storedTheme === "light"
          ? storedTheme
          : preferredTheme,
      );
    } finally {
      setIsThemeHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isThemeHydrated) return;
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("grade-uabj-theme", theme);
    } catch {
      // A preferência continua ativa enquanto o arquivo estiver aberto.
    }
  }, [isThemeHydrated, theme]);

  useEffect(() => {
    try {
      const cookieState = readProgressCookie();
      const localState = window.localStorage.getItem(progressStorageKey);
      let parsed: SavedListState | null = null;

      if (cookieState) {
        try {
          parsed = JSON.parse(cookieState) as SavedListState;
        } catch {
          clearProgressCookie();
        }
      }

      if (!parsed && localState) {
        parsed = JSON.parse(localState) as SavedListState;
      }

      if (parsed) {
        const validIds = new Set(disciplines.map((discipline) => discipline.id));
        const restoredCompleted = new Set(
          (parsed.completedIds ?? []).filter((id) => validIds.has(id)),
        );
        const restoredSelected = new Set(
          (parsed.selectedIds ?? []).filter(
            (id) =>
              validIds.has(id) &&
              !restoredCompleted.has(id) &&
              (prerequisiteIds[id] ?? []).every((prerequisiteId) =>
                restoredCompleted.has(prerequisiteId),
              ),
          ),
        );
        const restoredOfferings: Record<string, string> = {};
        restoredSelected.forEach((id) => {
          const discipline = disciplines.find((candidate) => candidate.id === id);
          if (!discipline?.offerings?.length) return;
          const requestedOffering = parsed.selectedOfferingIds?.[id];
          const validOffering = discipline.offerings.find(
            (offering) => offering.id === requestedOffering,
          );
          restoredOfferings[id] =
            validOffering?.id ?? discipline.offerings[0].id;
        });
        setCompletedIds(restoredCompleted);
        setSelectedIds(restoredSelected);
        setSelectedOfferingIds(restoredOfferings);
        if (
          parsed.catalogTab === "all" ||
          parsed.catalogTab === "completed" ||
          parsed.catalogTab === "eligible" ||
          parsed.catalogTab === "conflict-free"
        ) {
          setCatalogTab(parsed.catalogTab);
        }
      }
    } catch {
      window.localStorage.removeItem(progressStorageKey);
      clearProgressCookie();
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    setAutosaveStatus("Salvando...");
    const saveTimer = window.setTimeout(() => {
      const serializedState = JSON.stringify({
        version: 3,
        selectedIds: [...selectedIds],
        completedIds: [...completedIds],
        selectedOfferingIds,
        catalogTab,
      });
      let localSaved = false;
      try {
        window.localStorage.setItem(
          progressStorageKey,
          serializedState,
        );
        localSaved = true;
      } catch {
        // O cookie ainda pode manter o estado quando o armazenamento local falha.
      }
      const cookieSaved = writeProgressCookie(serializedState);
      setAutosaveStatus(
        cookieSaved
          ? "Salvo automaticamente em cookie"
          : localSaved
            ? "Salvo automaticamente neste dispositivo"
            : "Autosave indisponível",
      );
    }, 220);
    return () => window.clearTimeout(saveTimer);
  }, [catalogTab, completedIds, isHydrated, selectedIds, selectedOfferingIds]);

  useEffect(() => {
    if (!isHydrated) return;
    setSelectedIds((current) => {
      const next = new Set(
        [...current].filter(
          (id) =>
            !completedIds.has(id) &&
            (prerequisiteIds[id] ?? []).every((prerequisiteId) =>
              completedIds.has(prerequisiteId),
            ),
        ),
      );
      return next.size === current.size ? current : next;
    });
  }, [completedIds, isHydrated]);

  useEffect(() => {
    setSelectedOfferingIds((current) => {
      const next = Object.fromEntries(
        Object.entries(current).filter(([id]) => selectedIds.has(id)),
      );
      return Object.keys(next).length === Object.keys(current).length
        ? current
        : next;
    });
  }, [selectedIds]);

  useEffect(() => {
    if (!pendingDisciplineId) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPendingDisciplineId(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [pendingDisciplineId]);

  const selectedDisciplines = useMemo(
    () => disciplines.filter((discipline) => selectedIds.has(discipline.id)),
    [selectedIds],
  );

  const events = useMemo<DisplayEvent[]>(
    () =>
      selectedDisciplines.flatMap((discipline) => {
        const offering = getOffering(
          discipline,
          selectedOfferingIds[discipline.id],
        );
        const activeTimes = offering?.times ?? discipline.times;
        return activeTimes.map((time, index) => ({
          ...time,
          professor: offering?.professor ?? time.professor,
          room: offering?.room ?? time.room,
          discipline,
          key: `${discipline.id}-${index}`,
        }));
      }),
    [selectedDisciplines, selectedOfferingIds],
  );

  const conflictData = useMemo(() => {
    const eventKeys = new Set<string>();
    const pairs = new Map<
      string,
      { first: Discipline; second: Discipline; moments: string[] }
    >();

    for (let firstIndex = 0; firstIndex < events.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < events.length;
        secondIndex += 1
      ) {
        const first = events[firstIndex];
        const second = events[secondIndex];
        if (
          first.discipline.id === second.discipline.id ||
          first.day !== second.day ||
          first.start >= second.end ||
          second.start >= first.end
        ) {
          continue;
        }

        eventKeys.add(first.key);
        eventKeys.add(second.key);
        const ids = [first.discipline.id, second.discipline.id].sort();
        const key = ids.join("|");
        const moment = `${shortDays[first.day]}. ${formatHour(
          Math.max(first.start, second.start),
        )}–${formatHour(Math.min(first.end, second.end))}`;
        const current = pairs.get(key);
        if (current) {
          if (!current.moments.includes(moment)) current.moments.push(moment);
        } else {
          pairs.set(key, {
            first: first.discipline,
            second: second.discipline,
            moments: [moment],
          });
        }
      }
    }

    return { eventKeys, pairs: [...pairs.values()] };
  }, [events]);

  const totalHours = selectedDisciplines.reduce((sum, discipline) => {
    const offering = getOffering(
      discipline,
      selectedOfferingIds[discipline.id],
    );
    return (
      sum +
      (offering?.times ?? discipline.times).reduce(
        (disciplineSum, time) => disciplineSum + time.end - time.start,
        0,
      )
    );
  }, 0);

  const groupedDisciplines = useMemo(
    () =>
      periodOrder.map((period) => ({
        period,
        items: disciplines.filter((discipline) => discipline.period === period),
      })),
    [],
  );

  const eligibleCount = useMemo(
    () =>
      disciplines.filter(
        (discipline) =>
          !completedIds.has(discipline.id) &&
          (prerequisiteIds[discipline.id] ?? []).every((prerequisiteId) =>
            completedIds.has(prerequisiteId),
          ),
      ).length,
    [completedIds],
  );

  const conflictFreeIds = useMemo(() => {
    const compatibleIds = new Set<string>();
    disciplines.forEach((discipline) => {
      if (
        selectedIds.has(discipline.id) ||
        completedIds.has(discipline.id) ||
        !(prerequisiteIds[discipline.id] ?? []).every((prerequisiteId) =>
          completedIds.has(prerequisiteId),
        )
      ) {
        return;
      }

      const offeringTimes = discipline.offerings?.map(
        (offering) => offering.times,
      ) ?? [discipline.times];
      const hasCompatibleOffering = offeringTimes.some(
        (times) =>
          !times.some((time) =>
            events.some(
              (event) =>
                event.discipline.id !== discipline.id &&
                event.day === time.day &&
                event.start < time.end &&
                time.start < event.end,
            ),
          ),
      );
      if (hasCompatibleOffering) compatibleIds.add(discipline.id);
    });
    return compatibleIds;
  }, [completedIds, events, selectedIds]);

  const visibleGroupedDisciplines = useMemo(
    () =>
      groupedDisciplines
        .map(({ period, items }) => ({
          period,
          items: items.filter((discipline) => {
            if (catalogTab === "completed") {
              return completedIds.has(discipline.id);
            }
            if (catalogTab === "eligible") {
              return (
                !completedIds.has(discipline.id) &&
                (prerequisiteIds[discipline.id] ?? []).every(
                  (prerequisiteId) => completedIds.has(prerequisiteId),
                )
              );
            }
            if (catalogTab === "conflict-free") {
              return conflictFreeIds.has(discipline.id);
            }
            return true;
          }),
        }))
        .filter(({ items }) => items.length > 0),
    [catalogTab, completedIds, conflictFreeIds, groupedDisciplines],
  );

  const toggleDiscipline = (id: string) => {
    if (completedIds.has(id)) return;
    const missing = (prerequisiteIds[id] ?? []).filter(
      (prerequisiteId) => !completedIds.has(prerequisiteId),
    );
    if (missing.length > 0) return;
    const discipline = disciplines.find((candidate) => candidate.id === id);
    if (!discipline) return;
    if (selectedIds.has(id)) {
      setSelectedIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
      setSelectedOfferingIds((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }
    if ((discipline.offerings?.length ?? 0) > 1) {
      setPendingDisciplineId(id);
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const chooseOffering = (disciplineId: string, offeringId: string) => {
    setSelectedOfferingIds((current) => ({
      ...current,
      [disciplineId]: offeringId,
    }));
    setSelectedIds((current) => new Set(current).add(disciplineId));
    setPendingDisciplineId(null);
  };

  const toggleCompleted = (id: string) => {
    setCompletedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSelectedIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setSelectedOfferingIds((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const restoreSavedState = (parsed: SavedListState) => {
    const validIds = new Set(disciplines.map((discipline) => discipline.id));
    const restoredCompleted = new Set(
      (parsed.completedIds ?? []).filter((id) => validIds.has(id)),
    );
    const restoredSelected = new Set(
      (parsed.selectedIds ?? []).filter(
        (id) =>
          validIds.has(id) &&
          !restoredCompleted.has(id) &&
          (prerequisiteIds[id] ?? []).every((prerequisiteId) =>
            restoredCompleted.has(prerequisiteId),
          ),
      ),
    );
    const restoredOfferings: Record<string, string> = {};
    restoredSelected.forEach((id) => {
      const discipline = disciplines.find((candidate) => candidate.id === id);
      if (!discipline?.offerings?.length) return;
      const requestedOffering = parsed.selectedOfferingIds?.[id];
      const validOffering = discipline.offerings.find(
        (offering) => offering.id === requestedOffering,
      );
      restoredOfferings[id] = validOffering?.id ?? discipline.offerings[0].id;
    });
    setCompletedIds(restoredCompleted);
    setSelectedIds(restoredSelected);
    setSelectedOfferingIds(restoredOfferings);
    if (
      parsed.catalogTab === "all" ||
      parsed.catalogTab === "completed" ||
      parsed.catalogTab === "eligible" ||
      parsed.catalogTab === "conflict-free"
    ) {
      setCatalogTab(parsed.catalogTab);
    }
  };

  const currentShareState = (): SavedListState => ({
    version: 3,
    selectedIds: [...selectedIds],
    completedIds: [...completedIds],
    selectedOfferingIds,
    catalogTab,
  });

  const saveProgressFile = () => {
    const state = {
      version: 3,
      curso: "Engenharia de Computação — UABJ",
      semestre: "2026.2",
      savedAt: new Date().toISOString(),
      selectedIds: [...selectedIds],
      completedIds: [...completedIds],
      selectedOfferingIds,
      catalogTab,
      selectedDisciplines: disciplines
        .filter((discipline) => selectedIds.has(discipline.id))
        .map((discipline) => discipline.name),
      completedDisciplines: disciplines
        .filter((discipline) => completedIds.has(discipline.id))
        .map((discipline) => discipline.name),
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "minha-grade-uabj-2026-2.json";
    link.click();
    URL.revokeObjectURL(url);
    setFileMessage("Progresso salvo em arquivo.");
  };

  const loadProgressFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as SavedListState;
      restoreSavedState(parsed);
      setFileMessage("Arquivo carregado com sucesso.");
    } catch {
      setFileMessage("Não foi possível ler este arquivo.");
    }
  };

  const createCloudCode = async () => {
    if (selectedIds.size === 0 && completedIds.size === 0) {
      setCloudMessage("Selecione alguma disciplina antes de gerar o código.");
      return;
    }
    setIsCloudBusy(true);
    setCloudMessage("Salvando uma cópia permanente na nuvem...");
    try {
      const response = await secureSharingFetch(sharingApiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(currentShareState()),
      });
      const result = (await response.json()) as { code?: string; error?: string };
      if (!response.ok || !result.code) {
        throw new Error(result.error ?? "Não foi possível gerar o código.");
      }
      setGeneratedCloudCode(result.code);
      setCloudCodeInput(result.code);
      setCloudMessage("Código criado. Ele não expira e sempre abrirá esta grade.");
    } catch (error) {
      setCloudMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível gerar o código.",
      );
    } finally {
      setIsCloudBusy(false);
    }
  };

  const loadCloudCode = async () => {
    if (!/^\d{5}$/.test(cloudCodeInput)) {
      setCloudMessage("Digite os cinco dígitos do código.");
      return;
    }
    setIsCloudBusy(true);
    setCloudMessage("Buscando a grade na nuvem...");
    try {
      const response = await secureSharingFetch(
        `${sharingApiUrl}?code=${encodeURIComponent(cloudCodeInput)}`,
      );
      const result = (await response.json()) as {
        state?: SavedListState;
        error?: string;
      };
      if (!response.ok || !result.state) {
        throw new Error(result.error ?? "Código não encontrado.");
      }
      restoreSavedState(result.state);
      setGeneratedCloudCode(cloudCodeInput);
      setCloudMessage("Grade recuperada. O autosave já está ativo neste dispositivo.");
    } catch (error) {
      setCloudMessage(
        error instanceof Error ? error.message : "Não foi possível buscar o código.",
      );
    } finally {
      setIsCloudBusy(false);
    }
  };

  const shareCloudCode = async () => {
    if (!generatedCloudCode) return;
    const text = `Minha grade UABJ 2026.2 — código ${generatedCloudCode}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Grade Horária UABJ 2026.2",
          text,
          url: "https://laginh0.github.io/grade-horaria-uabj-2026-2/",
        });
        setCloudMessage("Código compartilhado.");
      } else {
        await navigator.clipboard.writeText(`${text}\nhttps://laginh0.github.io/grade-horaria-uabj-2026-2/`);
        setCloudMessage("Código e endereço copiados.");
      }
    } catch {
      setCloudMessage("Copie o código exibido e envie para seus amigos.");
    }
  };

  const overlapLayout = (event: DisplayEvent) => {
    const overlaps = events
      .filter(
        (candidate) =>
          candidate.day === event.day &&
          candidate.start < event.end &&
          event.start < candidate.end,
      )
      .sort((first, second) =>
        `${first.discipline.id}-${first.start}`.localeCompare(
          `${second.discipline.id}-${second.start}`,
        ),
      );
    const index = overlaps.findIndex((candidate) => candidate.key === event.key);
    return { index: Math.max(index, 0), count: Math.max(overlaps.length, 1) };
  };

  const pendingDiscipline = disciplines.find(
    (discipline) => discipline.id === pendingDisciplineId,
  );

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand-line">
          <div className="brand-identity">
            <span className="brand-mark" aria-hidden="true">
              GH
            </span>
            <span>UABJ · Engenharia de Computação · 2026.2</span>
          </div>
          <button
            className="theme-toggle"
            type="button"
            aria-pressed={theme === "dark"}
            onClick={() =>
              setTheme((current) => (current === "dark" ? "light" : "dark"))
            }
          >
            <span className="theme-icon" aria-hidden="true">
              {theme === "dark" ? "☀" : "◐"}
            </span>
            {theme === "dark" ? "Modo claro" : "Modo escuro"}
          </button>
        </div>
        <div className="hero-content">
          <div>
            <p className="eyebrow">Montador de grade semanal</p>
            <h1>Monte uma semana que funciona.</h1>
            <p className="hero-copy">
              Selecione disciplinas, compare horários e veja conflitos antes de
              fechar sua matrícula.
            </p>
          </div>
          <div className="stats" aria-live="polite">
            <div className="stat-card">
              <strong>{selectedDisciplines.length}</strong>
              <span>
                {selectedDisciplines.length === 1
                  ? "disciplina selecionada"
                  : "disciplinas selecionadas"}
              </span>
            </div>
            <div className="stat-card stat-card-accent">
              <strong>{totalHours}h</strong>
              <span>horas semanais em sala</span>
            </div>
            <div className="stat-card stat-card-completed">
              <strong>{completedIds.size}</strong>
              <span>
                {completedIds.size === 1
                  ? "disciplina já paga"
                  : "disciplinas já pagas"}
              </span>
            </div>
          </div>
        </div>
      </header>

      <section className="workspace">
        <aside className="catalog-panel" aria-label="Disciplinas disponíveis">
          <div className="panel-heading">
            <div>
              <p className="panel-kicker">Oferta 2026.2</p>
              <h2>Disciplinas</h2>
            </div>
            <div className="panel-actions">
              {selectedDisciplines.length > 0 && (
                <button
                  className="clear-button"
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                >
                  Limpar grade
                </button>
              )}
            </div>
          </div>
          <p className="catalog-help">
            Marque as opções para adicioná-las à grade ou sinalize o que você já
            pagou. O autosave usa cookie e armazenamento local neste dispositivo.
          </p>
          <div className="progress-backup">
            <div className="progress-backup-copy">
              <strong>Backup da sua grade</strong>
              <span>
                Baixe seu progresso e carregue o arquivo depois, inclusive em
                outro computador.
              </span>
            </div>
            <div className="progress-backup-actions">
              <button
                className="file-button"
                type="button"
                onClick={saveProgressFile}
              >
                <span aria-hidden="true">↓</span>
                Baixar progresso
              </button>
              <button
                className="file-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <span aria-hidden="true">↑</span>
                Carregar arquivo
              </button>
              <input
                className="file-input"
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                aria-label="Selecionar arquivo de progresso da grade"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadProgressFile(file);
                  event.target.value = "";
                }}
              />
            </div>
          </div>
          <section className="cloud-sharing" aria-labelledby="cloud-sharing-title">
            <div className="cloud-sharing-copy">
              <span className="cloud-badge">Nuvem protegida</span>
              <div>
                <strong id="cloud-sharing-title">Compartilhar com código</strong>
                <p>
                  Gere cinco dígitos permanentes ou digite um código recebido para
                  recuperar a grade em outro dispositivo. O acesso usa uma sessão
                  curta verificada e os dados ficam criptografados no servidor.
                </p>
              </div>
            </div>

            <button
              className="cloud-create-button"
              type="button"
              disabled={isCloudBusy}
              onClick={() => void createCloudCode()}
            >
              {isCloudBusy ? "Aguarde..." : "Gerar código permanente"}
            </button>

            {generatedCloudCode && (
              <div className="generated-code" aria-live="polite">
                <div>
                  <span>Seu código</span>
                  <output>{generatedCloudCode}</output>
                </div>
                <button type="button" onClick={() => void shareCloudCode()}>
                  Compartilhar
                </button>
              </div>
            )}

            <form
              className="cloud-code-form"
              onSubmit={(event) => {
                event.preventDefault();
                void loadCloudCode();
              }}
            >
              <label htmlFor="cloud-code">Abrir código existente</label>
              <div>
                <input
                  id="cloud-code"
                  value={cloudCodeInput}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={5}
                  pattern="[0-9]{5}"
                  placeholder="00000"
                  aria-describedby="cloud-code-help"
                  onChange={(event) =>
                    setCloudCodeInput(
                      event.target.value.replace(/\D/g, "").slice(0, 5),
                    )
                  }
                />
                <button type="submit" disabled={isCloudBusy}>
                  Recuperar grade
                </button>
              </div>
              <small id="cloud-code-help">
                O código não expira. Gerar novamente a mesma grade retorna o mesmo
                número.
              </small>
            </form>

            {cloudMessage && (
              <p className="cloud-message" role="status" aria-live="polite">
                {cloudMessage}
              </p>
            )}
          </section>
          <div className="autosave-indicator" role="status" aria-live="polite">
            <span aria-hidden="true" />
            {autosaveStatus}
          </div>
          {fileMessage && (
            <p className="file-message" role="status">
              {fileMessage}
            </p>
          )}

          <div
            className="catalog-tabs"
            role="tablist"
            aria-label="Filtrar disciplinas"
          >
            <button
              id="tab-all"
              type="button"
              role="tab"
              aria-selected={catalogTab === "all"}
              aria-controls="discipline-tab-panel"
              className={catalogTab === "all" ? "is-active" : ""}
              onClick={() => setCatalogTab("all")}
            >
              Todas <span>{disciplines.length}</span>
            </button>
            <button
              id="tab-completed"
              type="button"
              role="tab"
              aria-selected={catalogTab === "completed"}
              aria-controls="discipline-tab-panel"
              className={catalogTab === "completed" ? "is-active" : ""}
              onClick={() => setCatalogTab("completed")}
            >
              Concluídas <span>{completedIds.size}</span>
            </button>
            <button
              id="tab-eligible"
              type="button"
              role="tab"
              aria-selected={catalogTab === "eligible"}
              aria-controls="discipline-tab-panel"
              className={catalogTab === "eligible" ? "is-active" : ""}
              onClick={() => setCatalogTab("eligible")}
            >
              Podem matricular <span>{eligibleCount}</span>
            </button>
            <button
              id="tab-conflict-free"
              type="button"
              role="tab"
              aria-selected={catalogTab === "conflict-free"}
              aria-controls="discipline-tab-panel"
              className={catalogTab === "conflict-free" ? "is-active" : ""}
              onClick={() => setCatalogTab("conflict-free")}
            >
              Sem conflitos <span>{conflictFreeIds.size}</span>
            </button>
          </div>

          <div
            className="discipline-list"
            id="discipline-tab-panel"
            role="tabpanel"
            aria-labelledby={`tab-${catalogTab}`}
          >
            {visibleGroupedDisciplines.map(({ period, items }) => (
              <section className="period-group" key={period}>
                <div className="period-heading">
                  <h3>{period}</h3>
                  <span>{items.length}</span>
                </div>
                <div className="period-items">
                  {items.map((discipline) => {
                    const isSelected = selectedIds.has(discipline.id);
                    const isCompleted = completedIds.has(discipline.id);
                    const prerequisites = prerequisiteIds[discipline.id] ?? [];
                    const missingPrerequisites = prerequisites.filter(
                      (prerequisiteId) => !completedIds.has(prerequisiteId),
                    );
                    const isLocked =
                      !isCompleted && missingPrerequisites.length > 0;
                    const hasMultipleOfferings =
                      (discipline.offerings?.length ?? 0) > 1;
                    const selectedOffering = isSelected
                      ? getOffering(
                          discipline,
                          selectedOfferingIds[discipline.id],
                        )
                      : undefined;
                    const professorCount = new Set(
                      discipline.offerings?.map(
                        (offering) => offering.professor,
                      ) ?? [discipline.professor],
                    ).size;
                    const isElective = discipline.period.startsWith("Optativa");
                    const prerequisiteNames = prerequisites.map(
                      (prerequisiteId) =>
                        disciplines.find(
                          (candidate) => candidate.id === prerequisiteId,
                        )?.name ?? prerequisiteId,
                    );
                    const missingNames = missingPrerequisites.map(
                      (prerequisiteId) =>
                        disciplines.find(
                          (candidate) => candidate.id === prerequisiteId,
                        )?.name ?? prerequisiteId,
                    );
                    return (
                      <article
                        className={`discipline-card${
                          isSelected ? " is-selected" : ""
                        }${isCompleted ? " is-completed" : ""}${
                          isLocked ? " is-locked" : ""
                        }`}
                        key={discipline.id}
                        style={
                          { "--hue": discipline.color } as React.CSSProperties
                        }
                      >
                        <label className="schedule-choice">
                          <input
                            className="schedule-checkbox"
                            type="checkbox"
                            checked={isSelected}
                            disabled={isCompleted || isLocked}
                            onChange={() => toggleDiscipline(discipline.id)}
                          />
                          <span className="check-visual" aria-hidden="true">
                            ✓
                          </span>
                          <span className="discipline-copy">
                            <strong>
                              {discipline.name}
                              {isElective && (
                                <em className="elective-badge">Optativa</em>
                              )}
                            </strong>
                            <span>
                              {selectedOffering?.professor ??
                                (hasMultipleOfferings
                                  ? `${professorCount} professores disponíveis`
                                  : discipline.professor)}
                            </span>
                            <span className="discipline-room">
                              {selectedOffering?.room ??
                                (hasMultipleOfferings
                                  ? "Escolha a turma ao matricular"
                                  : discipline.room)}
                            </span>
                            <small>
                              {selectedOffering
                                ? formatTimes(selectedOffering.times)
                                : hasMultipleOfferings
                                  ? "Professor e horário serão escolhidos na próxima etapa"
                                  : formatTimes(discipline.times)}
                            </small>
                          </span>
                        </label>
                        {hasMultipleOfferings && isSelected && (
                          <button
                            className="change-offering-button"
                            type="button"
                            onClick={() => setPendingDisciplineId(discipline.id)}
                          >
                            Trocar professor ou turma
                          </button>
                        )}
                        <div className="prerequisite-row">
                          <label className="completed-check">
                            <input
                              type="checkbox"
                              checked={isCompleted}
                              onChange={() => toggleCompleted(discipline.id)}
                            />
                            <span>Já paguei</span>
                          </label>
                          {isCompleted ? (
                            <span className="status-pill status-completed">
                              Concluída
                            </span>
                          ) : isLocked ? (
                            <span
                              className="status-pill status-locked"
                              title={`Falta: ${missingNames.join(", ")}`}
                            >
                              Falta: {missingNames.join(", ")}
                            </span>
                          ) : prerequisites.length > 0 ? (
                            <span
                              className="status-pill status-ready"
                              title={`Atendidos: ${prerequisiteNames.join(", ")}`}
                            >
                              Pré-requisitos atendidos
                            </span>
                          ) : (
                            <span className="status-pill">Sem pré-requisitos</span>
                          )}
                        </div>
                        {prerequisiteNotes[discipline.id] && (
                          <p className="requirement-note">
                            {prerequisiteNotes[discipline.id]}
                          </p>
                        )}
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
            {visibleGroupedDisciplines.length === 0 && (
              <div className="tab-empty-state">
                <strong>
                  {catalogTab === "completed"
                    ? "Nenhuma disciplina concluída"
                    : catalogTab === "conflict-free"
                      ? "Nenhuma matéria encaixa na grade"
                      : "Nenhuma disciplina liberada"}
                </strong>
                <p>
                  {catalogTab === "completed"
                    ? "Marque “Já paguei” nas matérias concluídas para vê-las aqui."
                    : catalogTab === "conflict-free"
                      ? "Remova ou troque alguma turma selecionada para abrir novos horários."
                      : "Marque as matérias já pagas para liberar novos pré-requisitos."}
                </p>
              </div>
            )}
          </div>
        </aside>

        <section className="calendar-panel" aria-label="Grade semanal">
          <div className="calendar-heading">
            <div>
              <p className="panel-kicker">Sua semana</p>
              <h2>Grade horária</h2>
            </div>
            <div className="legend">
              <span>
                <i className="legend-dot" aria-hidden="true" /> Aula
              </span>
              <span>
                <i className="legend-conflict" aria-hidden="true" /> Conflito
              </span>
            </div>
          </div>

          {conflictData.pairs.length > 0 ? (
            <div className="conflict-alert" role="alert">
              <div className="alert-icon" aria-hidden="true">
                !
              </div>
              <div>
                <strong>
                  {conflictData.pairs.length === 1
                    ? "1 conflito encontrado"
                    : `${conflictData.pairs.length} conflitos encontrados`}
                </strong>
                <ul>
                  {conflictData.pairs.map((pair) => (
                    <li key={`${pair.first.id}-${pair.second.id}`}>
                      <b>{pair.first.name}</b> × <b>{pair.second.name}</b>
                      <span> — {pair.moments.join("; ")}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="conflict-clear" aria-live="polite">
              <span aria-hidden="true">✓</span>
              {selectedDisciplines.length === 0
                ? "Selecione disciplinas para começar."
                : "Tudo certo — nenhum conflito de horário."}
            </div>
          )}

          <p className="mobile-scroll-hint" aria-hidden="true">
            <span>↔</span> Deslize a grade para ver os outros dias
          </p>
          <div className="calendar-scroll">
            <div className="calendar" aria-label="Calendário de segunda a sexta">
              <div className="calendar-corner">Horário</div>
              {days.map((day) => (
                <div className="day-heading" key={day}>
                  <span>{day.slice(0, 3)}</span>
                  {day}
                </div>
              ))}

              {hours.map((hour) => (
                <div className="calendar-row" key={hour}>
                  <div className="time-label">
                    <strong>
                      {hour}:00 - {hour + 1}:00
                    </strong>
                  </div>
                  {days.map((day) => (
                    <div className="hour-cell" key={`${day}-${hour}`} />
                  ))}
                </div>
              ))}

              <div className="events-layer" aria-live="polite">
                {events.map((event) => {
                  const layout = overlapLayout(event);
                  const left = event.day * 20 + (layout.index * 20) / layout.count;
                  const width = 20 / layout.count;
                  const isConflict = conflictData.eventKeys.has(event.key);
                  const room = event.room ?? event.discipline.room;
                  const professor = event.professor ?? event.discipline.professor;
                  return (
                    <article
                      className={`class-event${
                        isConflict ? " has-conflict" : ""
                      }`}
                      key={event.key}
                      style={
                        {
                          "--hue": event.discipline.color,
                          top: `${(event.start - 7) * 58 + 3}px`,
                          height: `${(event.end - event.start) * 58 - 6}px`,
                          left: `calc(${left}% + 3px)`,
                          width: `calc(${width}% - 6px)`,
                        } as React.CSSProperties
                      }
                      aria-label={`${event.discipline.name}, ${days[event.day]}, ${event.start}h às ${event.end}h, ${room}`}
                    >
                      <button
                        type="button"
                        className="event-remove-button"
                        onClick={() => toggleDiscipline(event.discipline.id)}
                        aria-label={`Remover ${event.discipline.name} da grade`}
                        title={`Remover ${event.discipline.name}`}
                      >
                        ×
                      </button>
                      <div className="event-time">
                        {event.start}h–{event.end}h
                      </div>
                      <strong>{event.discipline.name}</strong>
                      <span>{professor}</span>
                      <span className="event-room">{room}</span>
                      {isConflict && <em>Conflito</em>}
                    </article>
                  );
                })}
              </div>

              {events.length === 0 && (
                <div className="empty-calendar">
                  <span className="empty-icon" aria-hidden="true">
                    +
                  </span>
                  <strong>Sua grade começa aqui</strong>
                  <p>Marque uma disciplina na lista para visualizar os horários.</p>
                </div>
              )}
            </div>
          </div>
          <p className="source-note">
            Dados consolidados dos horários UABJ 2026.2, versão de 31/07/2026.
          </p>
        </section>
      </section>

      {pendingDiscipline?.offerings && (
        <div
          className="offering-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setPendingDisciplineId(null);
            }
          }}
        >
          <section
            className="offering-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="offering-modal-title"
          >
            <button
              className="modal-close"
              type="button"
              aria-label="Fechar seleção de turma"
              onClick={() => setPendingDisciplineId(null)}
            >
              ×
            </button>
            <p className="panel-kicker">Escolha de turma</p>
            <h2 id="offering-modal-title">{pendingDiscipline.name}</h2>
            <p className="modal-description">
              Esta disciplina possui mais de um professor disponível. Escolha a
              turma que deseja adicionar à grade.
              {catalogTab === "conflict-free" &&
                " As opções que conflitam com sua grade estão desativadas."}
            </p>
            <div className="offering-options">
              {pendingDiscipline.offerings.map((offering) => {
                const isCurrent =
                  selectedOfferingIds[pendingDiscipline.id] === offering.id;
                const hasScheduleConflict = offering.times.some((time) =>
                  events.some(
                    (event) =>
                      event.discipline.id !== pendingDiscipline.id &&
                      event.day === time.day &&
                      event.start < time.end &&
                      time.start < event.end,
                  ),
                );
                const isDisabled =
                  catalogTab === "conflict-free" && hasScheduleConflict;
                return (
                  <button
                    className={`offering-option${
                      isCurrent ? " is-current" : ""
                    }${hasScheduleConflict ? " has-schedule-conflict" : ""}`}
                    type="button"
                    key={offering.id}
                    disabled={isDisabled}
                    onClick={() =>
                      chooseOffering(pendingDiscipline.id, offering.id)
                    }
                  >
                    <span className="offering-check" aria-hidden="true">
                      {isCurrent ? "✓" : ""}
                    </span>
                    <span className="offering-copy">
                      <strong>{offering.professor}</strong>
                      {offering.label && <em>{offering.label}</em>}
                      <span>{formatTimes(offering.times)}</span>
                      <small>{offering.room}</small>
                      <b
                        className={`offering-compatibility ${
                          hasScheduleConflict ? "is-conflicting" : "is-compatible"
                        }`}
                      >
                        {hasScheduleConflict
                          ? "Conflita com sua grade"
                          : "Compatível com sua grade"}
                      </b>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
