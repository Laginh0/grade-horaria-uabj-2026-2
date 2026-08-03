import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schedulePath = new URL("../app/data/schedule-courses.json", import.meta.url);
const allowedElectivesPath = new URL(
  "../app/data/allowed-electives.json",
  import.meta.url,
);
const pagePath = new URL("../app/page.tsx", import.meta.url);
const schedule = JSON.parse(await readFile(schedulePath, "utf8"));
const allowedElectives = JSON.parse(
  await readFile(allowedElectivesPath, "utf8"),
);
const pageSource = await readFile(pagePath, "utf8");

const expectedElectiveIds = [
  "acionamento-de-equipamentos-eletricos",
  "calculo-4",
  "circuitos-eletricos-2",
  "complementos-matematica",
  "controladores-logicos-programaveis",
  "controle-digital",
  "controle-inteligente",
  "desenho-tecnico",
  "educacao-relacoes-etnicas-raciais",
  "eletronica-2",
  "eletronica-de-potencia",
  "empreendedorismo-inovacao",
  "fisica-4",
  "maquinas-eletricas",
  "matematica-elementar",
  "mecanica-geral",
  "sistemas-de-controle",
  "sistemas-supervisorios",
];

test("o catálogo extraído cobre todas as páginas com turmas", () => {
  assert.equal(schedule.length, 142);
  assert.equal(
    schedule.reduce((total, course) => total + course.offerings.length, 0),
    158,
  );
  assert.equal(
    schedule.reduce(
      (total, course) =>
        total +
        course.offerings.reduce(
          (offeringTotal, offering) =>
            offeringTotal + offering.times.length * offering.sourcePages.length,
          0,
        ),
      0,
    ),
    419,
  );

  const pages = [
    ...new Set(schedule.flatMap((course) => course.sourcePages)),
  ].sort((left, right) => left - right);
  assert.deepEqual(
    pages,
    [
      1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18, 19,
      20, 21, 22, 23, 24, 25, 27, 28, 29, 31, 32, 33, 34, 35, 36, 37, 38,
      39, 41, 42, 43, 44,
    ],
  );
});

test("disciplinas, turmas e horários têm identificadores e valores válidos", () => {
  assert.equal(new Set(schedule.map((course) => course.id)).size, schedule.length);

  for (const course of schedule) {
    assert.ok(course.id && course.name);
    assert.doesNotMatch(course.name, /\(\s*1\s*\)$/u);
    assert.ok(course.offerings.length > 0);
    assert.ok(course.sourcePages.every((page) => page >= 1 && page <= 44));
    assert.equal(
      new Set(course.offerings.map((offering) => offering.id)).size,
      course.offerings.length,
    );

    for (const offering of course.offerings) {
      assert.ok(offering.professor && offering.room);
      assert.ok(offering.times.length > 0);
      assert.ok(offering.sourcePages.length > 0);
      const timeKeys = new Set();
      for (const time of offering.times) {
        assert.ok(Number.isInteger(time.day) && time.day >= 0 && time.day <= 4);
        assert.ok(time.start >= 7 && time.end <= 19 && time.start < time.end);
        assert.ok(time.room);
        const key = `${time.day}:${time.start}:${time.end}:${time.room}`;
        assert.equal(timeKeys.has(key), false, `${course.name}: horário duplicado`);
        timeKeys.add(key);
      }
    }
  }
});

test("Física 4 e optativas curriculares ofertadas foram recuperadas", () => {
  const byId = new Map(schedule.map((course) => [course.id, course]));
  for (const id of [
    "calculo-4",
    "circuitos-eletricos-2",
    "desenho-tecnico",
    "eletronica-2",
    "empreendedorismo-inovacao",
    "fisica-4",
  ]) {
    assert.ok(byId.has(id), `${id} deveria constar como ofertada`);
  }

  assert.deepEqual(byId.get("fisica-4").offerings[0].times, [
    { day: 1, start: 10, end: 12, room: "AEB-02C" },
    { day: 3, start: 8, end: 10, room: "AEB-02C" },
  ]);
  assert.equal(byId.get("fisica-2").name, "Física 2");
  assert.equal(byId.get("fisica-3").name, "Física 3");
});

test("o site exibe somente as dezoito optativas escolhidas", () => {
  const rawBlock = pageSource.slice(
    pageSource.indexOf("const rawDisciplines"),
    pageSource.indexOf("const scheduledCourses ="),
  );
  const rawEntries = [
    ...rawBlock.matchAll(
      /^  \{\r?\n    id:\s*"([^"]+)",([\s\S]*?)(?=^  \{|\r?\n\];)/gm,
    ),
  ].map((match) => ({
    id: match[1],
    period: match[2].match(/^    period:\s*"([^"]+)"/m)?.[1] ?? "",
    unavailable: match[2].includes('availability: "unavailable"'),
  }));
  const scheduledIds = new Set(schedule.map((course) => course.id));
  const electiveIds = allowedElectives.map((elective) => elective.id).sort();
  const electiveCodes = allowedElectives.map((elective) => elective.code);
  const coreDisciplineCount = rawEntries.filter(
    (discipline) =>
      !discipline.period.startsWith("Optativa") && !discipline.unavailable,
  ).length;

  assert.equal(rawEntries.length, 74);
  assert.equal(allowedElectives.length, 18);
  assert.deepEqual(electiveIds, expectedElectiveIds);
  assert.equal(new Set(electiveCodes).size, 18);
  assert.ok(allowedElectives.every((elective) => scheduledIds.has(elective.id)));
  assert.equal(coreDisciplineCount, 52);
  assert.equal(coreDisciplineCount + allowedElectives.length, 70);
  assert.equal(
    allowedElectives.find((elective) => elective.id === "controle-digital")
      .professor,
    "A definir docente",
  );
  assert.match(pageSource, /allowedElectiveIds\.has\(course\.id\)/);
  assert.match(pageSource, /placeholder="Buscar matéria, professor, sala ou código"/);
});
