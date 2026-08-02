# Grade Horária UABJ 2026.2

Montador interativo de grade semanal para Engenharia de Computação da UABJ.

## Acessar

[Abrir o montador de grade](https://laginh0.github.io/grade-horaria-uabj-2026-2/)

## Funcionalidades

- seleção de disciplinas e turmas por professor;
- calendário semanal de segunda a sexta, das 7h às 19h;
- identificação visual de conflitos de horário;
- filtros para matérias concluídas, disponíveis e sem conflitos;
- acompanhamento de pré-requisitos e disciplinas optativas;
- modo escuro;
- autosave no navegador;
- exportação e importação do progresso em arquivo separado.
- compartilhamento permanente da grade por código numérico de cinco dígitos.

## Uso local

O arquivo `index.html` é independente. Basta baixá-lo e abrir no navegador.

Para editar o projeto completo:

```bash
npm install
npm run dev
```

Para gerar novamente o arquivo independente:

```bash
node standalone/build-index.mjs
```

Os horários foram consolidados a partir dos documentos acadêmicos referentes ao semestre 2026.2.
