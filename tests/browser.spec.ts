import { expect, test } from "@playwright/test";

test("gives feedback and keeps the attempt in all progress periods after a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Abrir la clase", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ordenar con pistas" })).toBeVisible();

  const practice = page.getByRole("region", { name: "Ejercicios de prueba", exact: true });
  const checkAnswer = practice.getByRole("button", { name: "Comprobar", exact: true });
  await expect(checkAnswer).toBeDisabled();
  await page.getByRole("radio", { name: "A, C, B", exact: true }).check();
  await checkAnswer.click();
  await expect(page.getByText("Correcto", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Progreso", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Progreso" })).toBeVisible();
  await page.reload();
  for (const period of ["Día", "Semana", "Mes"]) {
    const button = page.getByRole("button", { name: period, exact: true });
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("100%", { exact: true })).toBeVisible();
    const questions = page.getByText("Preguntas resueltas", { exact: true }).locator("..");
    await expect(questions.getByText(/^1 correctas?$/)).toBeVisible();
  }
});

test("opens a copied lesson link in a separate browser context", async ({ page, context, browser }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/#/clase/hc-orden");
  await expect(page.getByRole("heading", { level: 1, name: "Ordenar con pistas" })).toBeVisible();
  await page.getByRole("button", { name: "Copiar enlace" }).click();
  await expect(page.getByRole("status")).toContainText("Enlace copiado.");
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(new URL(url).hash).toBe("#/clase/hc-orden");

  const shared = await browser.newPage();
  try {
    await shared.goto(url);
    await expect(shared.getByRole("heading", { level: 1, name: "Ordenar con pistas" })).toBeVisible();
    await expect(shared.getByRole("heading", { name: "Ejercicios de prueba" })).toBeVisible();
  } finally {
    await shared.close();
  }
});

test("recalculates a short study plan and saves the weekday and deadline after a reload", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-23T20:00:00Z"));
  await page.goto("/");
  await page.getByRole("link", { name: "Plan", exact: true }).click();

  const monday = page.getByRole("checkbox", { name: "Lun", exact: true });
  const tuesday = page.getByRole("checkbox", { name: "Mar", exact: true });
  const examDate = page.getByLabel(/Fecha del examen/);
  await expect(monday).toBeChecked();
  await expect(tuesday).toBeChecked();
  await monday.uncheck();
  await examDate.fill("2026-11-25");
  await page.getByRole("button", { name: "Guardar plan", exact: true }).click();
  const forecast = page.getByRole("heading", { name: "Próximas clases" }).locator("..");
  await expect(forecast.getByText(/^Faltan .* con tu horario actual/)).toBeVisible();
  const scheduledDays = forecast.getByRole("listitem");
  await expect(scheduledDays).toHaveCount(1);
  await expect(scheduledDays).toContainText(/martes,? 24 de noviembre/i);

  await page.reload();
  await expect(monday).not.toBeChecked();
  await expect(tuesday).toBeChecked();
  await expect(examDate).toHaveValue("2026-11-25");
  await expect(scheduledDays).toHaveCount(1);
  await expect(scheduledDays).toContainText(/martes,? 24 de noviembre/i);
});

test("keeps a timed answer on reload and grades it when time expires", async ({ page }) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("link", { name: "Simulacro", exact: true }).click();
  await page.getByRole("button", { name: "Serie de 10", exact: true }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Habilidad cognoscitiva" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pregunta 1 de 10", exact: true })).toBeVisible();
  await expect(page.getByLabel(/^Tiempo restante/)).toBeVisible();

  const answer = page.getByRole("radio", { name: "P, M, L, K", exact: true });
  await answer.check();
  await expect(page.getByText("1 de 10 respondidas", { exact: true })).toBeVisible();
  await expect(page.getByText("Respuesta correcta", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(answer).toBeChecked();
  await page.clock.fastForward("10:00");

  await expect(page.getByRole("heading", { level: 1, name: "Resultado del simulacro" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 de 10 correctas" })).toBeVisible();
  await expect(page.getByText("9 sin responder", { exact: true })).toBeVisible();
  await page.getByRole("checkbox", { name: "Mostrar solo errores y omisiones" }).uncheck();
  await page.getByText("Correcta · Ordenar con pistas", { exact: true }).click();
  await expect(page.getByText("Tu respuesta: P, M, L, K", { exact: true })).toBeVisible();
});

test.describe("narrow mobile viewport", () => {
  test.use({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });

  test("fits the home page, lesson and plan without horizontal scrolling", async ({ page }) => {
    const hasOverflow = () => page.evaluate(() =>
      document.documentElement.scrollWidth > document.documentElement.clientWidth);

    await page.goto("/");
    const openClass = page.getByRole("link", { name: "Abrir la clase", exact: true });
    await expect(openClass).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.clientWidth)).toBe(360);
    await expect.poll(hasOverflow).toBe(false);
    await openClass.tap();
    await expect(page.getByRole("heading", { level: 1, name: "Ordenar con pistas" })).toBeVisible();
    await expect.poll(hasOverflow).toBe(false);
    await page.getByRole("link", { name: "Plan", exact: true }).tap();
    await expect(page.getByRole("heading", { level: 1, name: "Plan de estudio" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegación principal" })).toBeInViewport();
    await expect.poll(hasOverflow).toBe(false);
    await page.getByLabel("Minutos al día").fill("45");
    await page.getByRole("button", { name: "Guardar plan", exact: true }).tap();
    await expect(page.getByText("Plan guardado.", { exact: true })).toBeInViewport({ ratio: 0.8 });
  });
});

test("brings back a missed skill with a fresh question on the following day", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-23T20:00:00Z"));
  await page.goto("/#/clase/hc-orden");
  const practice = page.getByRole("region", { name: "Ejercicios de prueba", exact: true });
  await practice.getByRole("radio", { name: "A, B, C", exact: true }).check();
  await practice.getByRole("button", { name: "Comprobar", exact: true }).click();
  await expect(page.getByText("Respuesta correcta: B", { exact: true })).toBeVisible();

  await page.clock.setFixedTime(new Date("2026-11-24T20:00:00Z"));
  await page.reload();
  await page.getByRole("link", { name: /^Repaso/ }).click();
  await page.getByRole("button", { name: "Empezar repaso", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ordenar con pistas" })).toBeVisible();
  await expect(page.getByText(/7 va después de 4/)).toBeVisible();
  await expect(page.getByRole("radio", { name: "A, B, C", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ver pista", exact: true }).click();
  await expect(page.locator(".hint")).toBeVisible();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Comprobar", exact: true }).click();
  await page.getByRole("button", { name: "Terminar repaso", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ronda terminada" })).toBeVisible();
});

test("keeps the shortcut to trial exercises and shows the order while checking example steps", async ({ page }) => {
  await page.goto("/#/clase/hc-orden");
  await page.getByRole("button", { name: "Probar el primer ejercicio" }).click();
  await expect(page.locator("#ejercicios")).toBeFocused();
  const rule = page.getByRole("region", { name: "Antes e inmediatamente antes", exact: true });
  const example = rule.getByRole("form", { name: "Ejemplo resuelto", exact: true });
  const tiles = rule.locator(".diagram-tile");
  await expect(tiles).toHaveText(["·", "·", "·", "·"]);
  await example.getByRole("radio", { name: "T–M–R", exact: true }).check();
  await example.getByRole("button", { name: "Comprobar paso" }).click();
  await expect(rule.getByText("Orden provisional: T–M–R", { exact: true })).toBeVisible();
  await expect(tiles).toHaveText(["·", "·", "·", "·"]);
  await example.getByRole("button", { name: "Siguiente paso" }).click();
  await example.getByRole("radio", { name: "Entre T y M", exact: true }).check();
  await example.getByRole("button", { name: "Comprobar paso" }).click();
  await expect(tiles).toHaveText(["T", "P", "M", "R"]);
});

test("exports progress and imports it only after confirmation", async ({ page, browser }) => {
  await page.goto("/#/clase/hc-orden");
  const practice = page.getByRole("region", { name: "Ejercicios de prueba", exact: true });
  await practice.getByRole("radio", { name: "A, C, B", exact: true }).check();
  await practice.getByRole("button", { name: "Comprobar", exact: true }).click();
  await page.getByText("Correcto", { exact: true }).waitFor();

  await page.getByRole("link", { name: "Plan", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Descargar respaldo" }).click(),
  ]);
  const filename = await download.path();
  if (!filename) throw Error("Missing backup file");
  const clean = await browser.newPage();
  try {
    const url = new URL(page.url());
    url.hash = "/plan";
    await clean.goto(url.href);
    await clean.locator('input[type="file"]').setInputFiles({
      name: "progreso.json", mimeType: "application/json", buffer: await (await import("node:fs/promises")).readFile(filename),
    });
    await expect(clean.getByText(/El respaldo incluye 1 respuesta/)).toBeVisible();
    await clean.getByRole("button", { name: "Cargar y reemplazar" }).click();
    await expect(clean.getByText("Respaldo cargado.")).toBeVisible();
    await clean.getByRole("link", { name: "Progreso", exact: true }).click();
    await expect(clean.getByText("100%", { exact: true })).toBeVisible();
  } finally {
    await clean.close();
  }
});

test("restores a submitted question and opens its saved doubt directly", async ({ page }) => {
  await page.goto("/#/clase/hc-orden");
  const exercise = page.locator(".question-details").first();
  await exercise.getByRole("radio", { name: "A, C, B", exact: true }).check();
  await exercise.getByRole("button", { name: "Comprobar", exact: true }).click();
  await exercise.getByRole("button", { name: "Guardar duda", exact: true }).click();
  await expect(exercise.getByRole("button", { name: "Duda guardada", exact: true })).toBeVisible();
  await page.reload();
  await expect(exercise.getByText("Correcto", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Progreso", exact: true }).click();
  await page.getByRole("link", { name: "Ordenar con pistas · Ejercicio 1", exact: true }).click();
  await expect(page).toHaveURL(/#\/clase\/hc-orden\/0$/);
  await expect(page.locator("#pregunta-marcada")).toBeFocused();
  await expect(page.locator("#pregunta-marcada")).toHaveAttribute("open", "");
  await page.getByRole("button", { name: "Volver a intentar", exact: true }).click();
  await expect(exercise.getByRole("button", { name: "Comprobar", exact: true })).toBeDisabled();
});

test("shows the diagram with equivalent labels in diagram exercises", async ({ page }) => {
  await page.goto("/#/clase/hc-diagramas");
  const diagram = page.locator("#ejercicios .exercise").first().getByRole("img", { name: /Sectores del diagrama/ });
  await expect(diagram).toBeVisible();
  await expect(diagram.locator("[data-venn-label]")).toHaveText(["A", "B", "C", "1", "2", "3", "4", "5", "6", "7"]);
});

test("times five fresh cognitive questions and compares with the next form", async ({ page }) => {
  const firstStart = new Date("2026-11-23T20:00:00Z");
  await page.clock.setFixedTime(firstStart);
  await page.goto("/#/clase/hc-orden");
  await expect(page.locator(".question-details")).toHaveCount(9);
  await page.getByRole("link", { name: "Hacer miniexamen", exact: true }).first().click();
  await page.getByRole("button", { name: "Empezar miniexamen" }).click();
  const fill = async (startAt: number) => {
    for (let index = startAt; index < 5; index++) {
      await page.getByRole("radio").first().check();
      if (index < 4) await page.getByRole("button", { name: "Siguiente" }).click();
    }
  };
  const firstQuestion = await page.locator("legend").textContent();
  await page.getByRole("button", { name: "Reiniciar prueba" }).click();
  await expect(page.getByRole("button", { name: "Descartar intento" })).toBeFocused();
  await page.getByRole("button", { name: "Seguir con la prueba" }).click();
  await expect(page.getByRole("button", { name: "Reiniciar prueba" })).toBeFocused();
  await expect(page.getByRole("button", { name: "Entregar miniexamen" })).toBeDisabled();
  await expect(page.getByText("Respuesta correcta", { exact: true })).toHaveCount(0);
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Siguiente" }).click();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Pregunta 2 de 5" })).toBeVisible();
  await fill(1);
  await page.clock.setFixedTime(new Date(firstStart.getTime() + 80_000));
  await page.getByRole("button", { name: "Entregar miniexamen" }).click();
  await expect(page.getByText("1 min 20 s", { exact: true })).toBeVisible();

  await page.clock.setFixedTime(new Date(firstStart.getTime() + 86_400_000));
  await page.getByRole("button", { name: "Hacer otro miniexamen" }).click();
  await page.getByRole("button", { name: "Empezar miniexamen" }).click();
  await expect(page.locator("legend")).not.toHaveText(firstQuestion!);
  await fill(0);
  await page.clock.setFixedTime(new Date(firstStart.getTime() + 86_460_000));
  await page.getByRole("button", { name: "Entregar miniexamen" }).click();
  await expect(page.getByText("20 s menos que la anterior", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("20 s menos que la anterior", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Ver progreso" }).click();
  const history = page.getByRole("region", { name: "Miniexámenes", exact: true });
  await expect(history.getByRole("listitem")).toHaveCount(2);
  await expect(history.getByText("1 min 20 s", { exact: true })).toBeVisible();
  await expect(history.getByText("1 min", { exact: true })).toBeVisible();

  await page.evaluate(() => {
    const key = "marie-cetys:study:v1";
    const backup = JSON.parse(localStorage.getItem(key)!);
    delete backup.miniResults;
    localStorage.setItem(key, JSON.stringify(backup));
  });
  await page.reload();
  await page.goto("/#/mini/hc-orden");
  await expect(page.getByRole("button", { name: "Empezar miniexamen" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entregar miniexamen" })).toHaveCount(0);
});

test("keeps class mode when returning from a miniexam and clears it after logging class", async ({ page }) => {
  await page.goto("/#/clase/hc-orden");
  const classMode = page.getByRole("checkbox", { name: "Estamos en clase" });
  await classMode.check();
  await page.getByRole("link", { name: "Hacer miniexamen", exact: true }).click();
  await page.getByRole("link", { name: "Volver a los ejercicios" }).click();
  await expect(classMode).toBeChecked({ timeout: 2000 });
  await page.getByRole("button", { name: /Guardar sesión/ }).click();
  await expect(classMode).not.toBeChecked();
});

test("the orthography lesson interleaves examples and exercises before the trial questions and mini-exam", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.clock.setFixedTime(new Date("2026-11-24T20:00:00Z"));
  await page.goto("/#/clase/es-ortografia");
  const exercises = page.getByRole("region", { name: "Ejercicios de prueba", exact: true });
  await expect(exercises.getByText("16 preguntas", { exact: true })).toBeVisible();
  await expect(exercises.locator("details.question-details")).toHaveCount(16);
  const addedExercise = exercises.locator("details.question-details").last();
  await addedExercise.locator("summary").click();
  await addedExercise.getByRole("button", { name: "Ver pista", exact: true }).click();
  await expect(addedExercise.locator(".hint")).toBeVisible();
  await addedExercise.getByRole("radio", { name: "aún / aun", exact: true }).check();
  await addedExercise.getByRole("button", { name: "Comprobar", exact: true }).click();
  await expect(addedExercise.getByText("Correcto", { exact: true })).toBeVisible();
  const rules = page.getByRole("region", { name: "Explicación", exact: true });
  const titles = ["Nombre común y nombre propio", "Hiato y diptongo", "Por qué, porque, porqué y por que",
    "Agudas, graves y esdrújulas", "Tildes que distinguen funciones"];
  for (const title of titles) {
    const rule = rules.getByRole("region", { name: title, exact: true });
    await expect(rule.getByRole("list").first()).toBeVisible();
    await expect(rule.getByRole("heading", { level: 4 })).toHaveText(["Ejemplo resuelto", "Ejercicio guiado"]);
    await expect(rule.getByRole("form", { name: "Ejemplo resuelto" }).getByRole("radio")).toHaveCount(2);
    await expect(rule.locator(".lesson-guided-practice").getByRole("radio")).toHaveCount(4);
  }
  await expect(page.locator("#explicacion + #ejercicios")).toHaveCount(1);
  const afterExercises = page.locator("#ejercicios + section");
  const miniLink = afterExercises.getByRole("link", { name: "Hacer miniexamen", exact: true });
  await expect(miniLink).toHaveAttribute("href", "#/mini/es-ortografia");
  await miniLink.click();
  await expect(page.getByRole("heading", { name: "10 preguntas", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Empezar miniexamen" }).click();
  for (let index = 0; index < 10; index++) {
    await expect(page.getByRole("heading", { name: `Pregunta ${index + 1} de 10` })).toBeVisible();
    await page.getByRole("radio").first().check();
    if (index === 5) {
      await page.reload();
      await expect(page.getByRole("radio").first()).toBeChecked();
      await expect(page.getByRole("button", { name: "Entregar miniexamen" })).toBeDisabled();
    }
    if (index < 9) await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  }
  await page.getByRole("button", { name: "Entregar miniexamen" }).click();
  await expect(page.getByRole("heading", { name: "Resultado del miniexamen" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Soluciones" }).locator("details")).toHaveCount(10);
  await page.getByRole("link", { name: "Ver progreso", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("region", { name: "Miniexámenes", exact: true }).getByRole("link", { name: "Mayúsculas y acentuación", exact: true })).toHaveAttribute("href", "#/mini/es-ortografia");
  await expect(page.getByText("Español", { exact: true }).locator("..")).toContainText("2 de 11");

  await page.clock.setFixedTime(new Date("2026-11-25T20:00:00Z"));
  await page.goto("/#/repaso");
  await page.reload();
  await expect(page.getByRole("link", { name: "Miniexamen de Mayúsculas y acentuación" })).toHaveAttribute("href", "#/mini/es-ortografia");
});

for (const skill of ["mat-enteros", "en-sentence-order"]) {
  test(`opens the mini-exam from the class guide for ${skill}`, async ({ page }) => {
    await page.goto(`/#/clase/${skill}`);
    await page.getByRole("link", { name: "Ir al miniexamen", exact: true }).click();
    await page.getByRole("button", { name: "Empezar miniexamen" }).click();
    await expect(page.getByRole("heading", { name: "Pregunta 1 de 5" })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(4);
  });
}

test("finishes a legacy orthography draft and rotates through two fresh ten-question forms", async ({ page }) => {
  await page.addInitScript(() => {
    const key = "marie-cetys:mini:es-ortografia";
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, JSON.stringify({
      id: "legacy-orthography-draft", form: 0, current: 4,
      started: Date.now() - 60_000, answers: [1, 3, 0, 2, 2],
    }));
  });
  await page.goto("/#/mini/es-ortografia");
  await expect(page.getByRole("heading", { name: "Pregunta 5 de 5" })).toBeVisible();
  const previousPrompt = await page.locator("legend").innerText();
  await page.getByRole("button", { name: "Entregar miniexamen", exact: true }).click();
  await expect(page.getByText("5 de 5", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Soluciones" }).locator("details")).toHaveCount(5);
  await page.getByRole("button", { name: "Hacer otro miniexamen" }).click();
  await expect(page.getByRole("heading", { name: "10 preguntas", exact: true })).toBeVisible();
  await expect(page.getByText(/Último intento · 5 de 5/)).toBeVisible();
  await page.getByRole("button", { name: "Empezar miniexamen" }).click();
  await expect(page.getByRole("heading", { name: "Pregunta 1 de 10" })).toBeVisible();
  const retakePrompts: string[] = [];
  for (let index = 0; index < 10; index++) {
    retakePrompts.push(await page.locator("legend").innerText());
    await page.getByRole("radio").first().check();
    if (index < 9) await page.getByRole("button", { name: "Siguiente", exact: true }).click();
  }
  expect(retakePrompts).not.toContain(previousPrompt);
  await page.getByRole("button", { name: "Entregar miniexamen", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Resultado del miniexamen" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Soluciones" }).locator("details")).toHaveCount(10);
  await page.getByRole("button", { name: "Hacer otro miniexamen" }).click();
  await page.getByRole("button", { name: "Empezar miniexamen" }).click();
  await expect(page.locator("legend")).not.toHaveText(retakePrompts[0]);
});

test("remembers a guided answer and opens its saved doubt inside the explanation", async ({ page }) => {
  await page.goto("/#/clase/es-ortografia");
  const guided = page.getByRole("region", { name: "Hiato y diptongo", exact: true });
  await guided.getByRole("radio", { name: "río tiene hiato y patio tiene diptongo.", exact: true }).check();
  await guided.getByRole("button", { name: "Comprobar", exact: true }).click();
  await expect(guided.getByText("Correcto", { exact: true })).toBeVisible();
  await guided.getByRole("button", { name: "Guardar duda", exact: true }).click();
  await page.getByRole("link", { name: "Progreso", exact: true }).click();
  await page.reload();
  const saved = page.getByRole("link", { name: "Mayúsculas y acentuación · Hiato y diptongo", exact: true });
  await expect(saved).toHaveAttribute("href", "#/clase/es-ortografia/guiado-hiato");
  await saved.click();
  await expect(guided).toBeFocused();
  await expect(guided.getByText("Correcto", { exact: true })).toBeVisible();
});

test("checks each step of an example and keeps its choices when moving back", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/#/clase/es-ortografia");
  const example = page.getByRole("region", { name: "Hiato y diptongo", exact: true })
    .getByRole("form", { name: "Ejemplo resuelto", exact: true });
  await expect(example.getByText("Paso 1 de 2")).toBeVisible();
  await expect(example.getByText(/La i átona queda junto a la a/)).toHaveCount(0);
  const wrongAnswer = example.getByRole("radio", { name: "ha-ci-a", exact: true });
  await wrongAnswer.focus();
  await wrongAnswer.press("Space");
  await example.getByRole("button", { name: "Comprobar paso", exact: true }).press("Enter");
  await expect(example.getByText("Respuesta correcta: A")).toBeVisible();
  await expect(example.getByText(/La i átona queda junto a la a/)).toBeVisible();
  await example.getByRole("button", { name: "Siguiente paso" }).click();
  await expect(example.getByText("Paso 2 de 2")).toBeVisible();
  await expect(example.locator("legend")).toBeFocused();
  await example.getByRole("radio", { name: "Hiato", exact: true }).check();
  await example.getByRole("button", { name: "Comprobar paso", exact: true }).click();
  await expect(example.getByText("Correcto", { exact: true })).toBeVisible();
  await example.getByRole("button", { name: "Paso anterior" }).click();
  await expect(wrongAnswer).toBeChecked();
  await expect(example.getByText("Respuesta correcta: A")).toBeVisible();
  await example.getByRole("button", { name: "Reiniciar ejemplo" }).click();
  await expect(wrongAnswer).not.toBeChecked();
  await expect(example.getByText(/La i átona queda junto a la a/)).toHaveCount(0);
  await page.getByRole("link", { name: "Progreso", exact: true }).click();
  await expect(page.getByText("Español", { exact: true }).locator("..")).toContainText("0 de 0");
});

test("sets more study time for one date and keeps the normal weekday duration", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.clock.setFixedTime(new Date("2026-11-27T20:00:00Z"));
  await page.goto("/#/plan");
  const adjusted = page.getByRole("group", { name: "Tiempo por fecha" });
  const saturday = /sábado,? 28 de noviembre/i;
  const upcoming = page.getByRole("heading", { name: "Próximas clases" }).locator("..");
  const saturdaySlot = upcoming.getByRole("listitem").filter({ hasText: saturday });
  await expect(saturdaySlot).toHaveCount(0);

  await adjusted.getByLabel("Fecha de estudio", { exact: true }).fill("2026-11-28");
  await adjusted.getByLabel("Minutos para esa fecha", { exact: true }).fill("90");
  await adjusted.getByRole("button", { name: "Añadir tiempo", exact: true }).click();
  await page.getByRole("button", { name: "Guardar plan", exact: true }).click();

  await expect(saturdaySlot).toContainText("90 min");
  await expect(upcoming.getByRole("listitem").filter({ hasText: /viernes,? 27 de noviembre/i })).toContainText("60 min");
  await page.reload();
  await expect(adjusted.getByRole("listitem").filter({ hasText: saturday })).toContainText("90 min");
  await expect(page.getByLabel("Minutos al día", { exact: true })).toHaveValue("60");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(375);

  await page.getByRole("link", { name: "Clase de hoy", exact: true }).click();
  await expect(page.getByRole("progressbar", { name: "Tiempo de estudio esta semana" })).toHaveAttribute("max", "150");

  await page.getByRole("link", { name: "Plan", exact: true }).click();
  await adjusted.getByRole("button", { name: /Quitar tiempo del sábado/i }).click();
  await page.getByRole("button", { name: "Guardar plan", exact: true }).click();
  await expect(saturdaySlot).toHaveCount(0);
});

for (const lesson of ["mat-areas", "en-verb-forms", "es-comprension"]) {
  test(`uses the same contrast, example and exercise sequence for ${lesson}`, async ({ page }) => {
    await page.goto(`/#/clase/${lesson}`);
    const rules = page.getByRole("region", { name: "Explicación", exact: true });
    await expect(rules).toBeVisible();
    expect(await rules.getByRole("heading", { level: 3 }).count()).toBeGreaterThanOrEqual(2);
    const first = rules.getByRole("region").first();
    const example = first.getByRole("form", { name: "Ejemplo resuelto", exact: true });
    await example.getByRole("radio").first().check();
    await example.getByRole("button", { name: "Comprobar paso", exact: true }).click();
    await expect(example.locator(".feedback p")).toBeVisible();
    await example.getByRole("button", { name: "Siguiente paso", exact: true }).click();
    await expect(example.getByText(/^Paso 2 de /)).toBeVisible();
    await expect(first.getByRole("button", { name: "Comprobar", exact: true })).toBeVisible();
    await expect(page.locator("#explicacion + #ejercicios + section").getByRole("link", { name: "Hacer miniexamen" }))
      .toHaveAttribute("href", `#/mini/${lesson}`);
  });
}

test("syncs local history between two devices and uploads work after a connection failure", async ({ page, browser }) => {
  const key = "a".repeat(64);
  let password = key;
  const progressKey = "marie-cetys:study:v1";
  const second = await browser.newPage();
  const start = new Date("2026-11-24T20:00:00Z");
  await page.clock.setFixedTime(start);
  await second.clock.setFixedTime(start);
  let revision = 0;
  const remote: { state: { attempts: { id: string; item: string }[]; settings: { minutes: number } } | null } = { state: null };

  async function mock(device: typeof page) {
    let connected = false;
    let offline = false;
    await device.route(/\/api\/progress(?:\/session)?$/, async route => {
      const request = route.request();
      const method = request.method();
      if (offline) return route.abort("internetdisconnected");
      if (new URL(request.url()).pathname.endsWith("/session")) {
        if (method === "DELETE") {
          connected = false;
          return route.fulfill({ status: 204 });
        }
        const body = request.postDataJSON();
        if (method === "PUT") {
          if (!connected || body.currentPassword !== password) return route.fulfill({ status: 401 });
          password = body.password;
          return route.fulfill({ status: 204 });
        }
        connected = body.username === "marie" && body.password === password;
        return route.fulfill({ status: connected ? 204 : 401 });
      }
      if (!connected) return route.fulfill({ status: 401 });
      if (method === "PUT") {
        const update = request.postDataJSON();
        if (update.revision !== revision) return route.fulfill({ status: 409 });
        remote.state = update.state;
        revision++;
      }
      return route.fulfill({ json: { revision, state: remote.state } });
    });
    return { setOffline: (value: boolean) => { offline = value; } };
  }

  const panel = (device: typeof page) => device.getByRole("region", { name: "Sincronizar progreso", exact: true });
  async function connect(device: typeof page, credential: string) {
    await device.getByRole("link", { name: "Iniciar sesión", exact: true }).click();
    const sync = panel(device);
    await expect(device.getByRole("heading", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await expect(sync.getByLabel("Usuario", { exact: true })).toHaveAttribute("autocomplete", "username");
    const field = sync.getByLabel("Contraseña", { exact: true });
    await expect(field).toHaveAttribute("autocomplete", "current-password");
    await field.fill(credential);
    await sync.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await expect(sync.getByText("Este dispositivo está sincronizado.", { exact: true })).toBeVisible();
  }

  try {
    await mock(page);
    const device = await mock(second);
    await page.goto("/#/clase/hc-orden");
    const firstPractice = page.getByRole("region", { name: "Ejercicios de prueba", exact: true });
    await firstPractice.getByRole("radio", { name: "A, C, B", exact: true }).check();
    await firstPractice.getByRole("button", { name: "Comprobar", exact: true }).click();
    await expect(firstPractice.getByText("Correcto", { exact: true })).toBeVisible();
    await connect(page, key);
    await expect.poll(() => remote.state?.attempts.length).toBe(1);
    const chosen = "mi contraseña de prueba";
    await panel(page).getByText("Cambiar contraseña", { exact: true }).click();
    await panel(page).getByLabel("Contraseña actual", { exact: true }).fill(key);
    await panel(page).getByLabel("Nueva contraseña", { exact: true }).fill(chosen);
    await panel(page).getByRole("button", { name: "Guardar contraseña", exact: true }).click();
    await expect(panel(page).getByText("Contraseña guardada.", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Plan", exact: true }).click();
    await page.getByLabel("Minutos al día", { exact: true }).fill("75");
    await page.getByRole("button", { name: "Guardar plan", exact: true }).click();
    await expect.poll(() => remote.state?.settings.minutes).toBe(75);

    await second.goto("/#/");
    await connect(second, chosen);
    await second.getByRole("link", { name: "Plan", exact: true }).click();
    await expect(second.getByLabel("Minutos al día", { exact: true })).toHaveValue("75");
    await second.getByRole("link", { name: "Progreso", exact: true }).click();
    await expect(second.getByText("100%", { exact: true })).toBeVisible();

    device.setOffline(true);
    await second.goto("/#/clase/es-ortografia/guiado-hiato");
    const guided = second.getByRole("region", { name: "Hiato y diptongo", exact: true }).locator(".lesson-guided-practice");
    await guided.getByRole("radio", { name: "río tiene hiato y patio tiene diptongo.", exact: true }).check();
    await guided.getByRole("button", { name: "Comprobar", exact: true }).click();
    await second.getByRole("link", { name: "Plan", exact: true }).click();
    await expect(panel(second).getByText(/No se pudo sincronizar/)).toBeVisible();
    expect(await second.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!).attempts.length, progressKey)).toBe(2);
    expect(remote.state?.attempts.length).toBe(1);

    device.setOffline(false);
    await panel(second).getByRole("button", { name: "Sincronizar ahora", exact: true }).click();
    await expect.poll(() => remote.state?.attempts.length).toBe(2);
    await panel(page).getByRole("button", { name: "Sincronizar ahora", exact: true }).click();
    await expect.poll(() => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!).attempts.length, progressKey)).toBe(2);
    await panel(page).getByRole("button", { name: "Cerrar sesión", exact: true }).click();
    await expect(page.getByRole("link", { name: "Iniciar sesión", exact: true })).toBeVisible();
    await expect.poll(() => page.evaluate(storageKey => JSON.parse(localStorage.getItem(storageKey)!).attempts.length, progressKey)).toBe(2);
  } finally {
    await second.close();
  }
});
