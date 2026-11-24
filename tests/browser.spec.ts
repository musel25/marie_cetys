import { expect, test } from "@playwright/test";

test("gives feedback and keeps the attempt in all progress periods after a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Abrir la clase", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Ordenar con pistas" })).toBeVisible();

  const example = page.getByRole("button", { name: "Ver el primer paso" });
  await example.click();
  await expect(page.getByText("Dibuja cuatro casillas. Las dos primeras pistas dan el orden T–M–R.")).toBeVisible();

  const checkAnswer = page.getByRole("button", { name: "Comprobar", exact: true });
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
    await expect(shared.getByRole("heading", { name: "Ejercicios" })).toBeVisible();
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
    await expect.poll(hasOverflow).toBe(false);
  });
});

test("brings back a missed skill with a fresh question on the following day", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-23T20:00:00Z"));
  await page.goto("/#/clase/hc-orden");
  await page.getByRole("radio", { name: "A, B, C", exact: true }).check();
  await page.getByRole("button", { name: "Comprobar", exact: true }).click();
  await expect(page.getByText("Respuesta correcta: B", { exact: true })).toBeVisible();

  await page.clock.setFixedTime(new Date("2026-11-24T20:00:00Z"));
  await page.reload();
  await page.getByRole("link", { name: /^Repaso/ }).click();
  await page.getByRole("button", { name: "Empezar repaso", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ordenar con pistas" })).toBeVisible();
  await expect(page.getByRole("radio", { name: "A, B, C", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Ver pista", exact: true }).click();
  await expect(page.locator(".hint")).toBeVisible();
  await page.getByRole("radio").first().check();
  await page.getByRole("button", { name: "Comprobar", exact: true }).click();
  await page.getByRole("button", { name: "Terminar repaso", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Ronda terminada" })).toBeVisible();
});
