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

type Discipline = {
  id: string;
  period: string;
  name: string;
  professor: string;
  room: string;
  color: number;
  times: ClassTime[];
};

type DisplayEvent = ClassTime & {
  discipline: Discipline;
  key: string;
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
    times: [t(0, 10, 12), t(2, 10, 12)],
  },
  {
    id: "geometria-analitica",
    period: "1º período",
    name: "Geometria Analítica",
    professor: "Rebeka Domingues",
    room: "AEB-03B",
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
    times: [t(0, 14, 16), t(2, 14, 16)],
  },
  {
    id: "algebra-linear",
    period: "2º período",
    name: "Álgebra Linear",
    professor: "Mauri Pereira",
    room: "AEB-05B",
    times: [t(0, 16, 18), t(1, 16, 18)],
  },
  {
    id: "fisica-2",
    period: "2º período",
    name: "Física 2 (1)",
    professor: "Elaine Oliveira da Silva",
    room: "AEB-05C",
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
    times: [t(1, 8, 10), t(2, 10, 12)],
  },
  {
    id: "fisica-3",
    period: "3º período",
    name: "Física 3 (1)",
    professor: "Elaine Oliveira da Silva",
    room: "AEB-02B",
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

export default function Home() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [isHydrated, setIsHydrated] = useState(false);
  const [fileMessage, setFileMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("grade-uabj-2026-2");
      if (stored) {
        const parsed = JSON.parse(stored) as {
          selectedIds?: string[];
          completedIds?: string[];
        };
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
        setCompletedIds(restoredCompleted);
        setSelectedIds(restoredSelected);
      }
    } catch {
      window.localStorage.removeItem("grade-uabj-2026-2");
    } finally {
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    window.localStorage.setItem(
      "grade-uabj-2026-2",
      JSON.stringify({
        version: 1,
        selectedIds: [...selectedIds],
        completedIds: [...completedIds],
      }),
    );
  }, [completedIds, isHydrated, selectedIds]);

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

  const selectedDisciplines = useMemo(
    () => disciplines.filter((discipline) => selectedIds.has(discipline.id)),
    [selectedIds],
  );

  const events = useMemo<DisplayEvent[]>(
    () =>
      selectedDisciplines.flatMap((discipline) =>
        discipline.times.map((time, index) => ({
          ...time,
          discipline,
          key: `${discipline.id}-${index}`,
        })),
      ),
    [selectedDisciplines],
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

  const totalHours = selectedDisciplines.reduce(
    (sum, discipline) =>
      sum +
      discipline.times.reduce(
        (disciplineSum, time) => disciplineSum + time.end - time.start,
        0,
      ),
    0,
  );

  const groupedDisciplines = useMemo(
    () =>
      periodOrder.map((period) => ({
        period,
        items: disciplines.filter((discipline) => discipline.period === period),
      })),
    [],
  );

  const toggleDiscipline = (id: string) => {
    if (completedIds.has(id)) return;
    const missing = (prerequisiteIds[id] ?? []).filter(
      (prerequisiteId) => !completedIds.has(prerequisiteId),
    );
    if (missing.length > 0) return;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
  };

  const saveProgressFile = () => {
    const state = {
      version: 1,
      curso: "Engenharia de Computação — UABJ",
      semestre: "2026.2",
      savedAt: new Date().toISOString(),
      selectedIds: [...selectedIds],
      completedIds: [...completedIds],
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
      const parsed = JSON.parse(await file.text()) as {
        selectedIds?: string[];
        completedIds?: string[];
      };
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
      setCompletedIds(restoredCompleted);
      setSelectedIds(restoredSelected);
      setFileMessage("Arquivo carregado com sucesso.");
    } catch {
      setFileMessage("Não foi possível ler este arquivo.");
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

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="brand-line">
          <span className="brand-mark" aria-hidden="true">
            GH
          </span>
          <span>UABJ · Engenharia de Computação · 2026.2</span>
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
              <button
                className="file-button"
                type="button"
                onClick={saveProgressFile}
              >
                Salvar arquivo
              </button>
              <button
                className="file-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                Carregar
              </button>
              <input
                className="file-input"
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void loadProgressFile(file);
                  event.target.value = "";
                }}
              />
            </div>
          </div>
          <p className="catalog-help">
            Marque as opções para adicioná-las à grade ou sinalize o que você já
            pagou. O progresso fica salvo neste dispositivo.
          </p>
          {fileMessage && (
            <p className="file-message" role="status">
              {fileMessage}
            </p>
          )}

          <div className="discipline-list">
            {groupedDisciplines.map(({ period, items }) => (
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
                            <strong>{discipline.name}</strong>
                            <span>{discipline.professor}</span>
                            <span className="discipline-room">
                              {discipline.room}
                            </span>
                            <small>{formatTimes(discipline.times)}</small>
                          </span>
                        </label>
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
                    <strong>{hour}h</strong>
                    <span>{hour + 1}h</span>
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
    </main>
  );
}
