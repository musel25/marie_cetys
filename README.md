# Marie CETYS

A Spanish-language PIENSE II study site with tutor-led lessons, exam-style exercises, and spaced review.

The default plan includes sixty minutes per day from Monday through Friday. The lesson material is open for optional practice at any time.

## Uso

- Abre **Clase de hoy** para ver la lección sugerida. En una lección, elige **Fijar como clase de hoy** o copia el enlace para compartirla.
- Abre **Guía para la clase** para ver los tiempos, las variantes y la pregunta de salida de la primera sesión.
- En **Plan**, selecciona los días, minutos por sesión, fecha de inicio, fecha del examen y días libres.
- En **Progreso**, selecciona **Día**, **Semana** o **Mes**. Las respuestas del modo de clase cuentan en los resultados. Registra los minutos de la clase una vez.
- El progreso se guarda en el navegador. En **Plan**, conecta la sincronización con la clave para tener el mismo progreso en otro dispositivo. También puedes descargar un respaldo.

## Desarrollo

Usa Node.js 22.12 o una versión posterior.

```sh
npm ci
npm run dev
npm run check
npx playwright install chromium
npm run test:browser
```

## Material

- [Temario y cobertura](docs/temario.md)
- [Primera clase](docs/primera-clase.md)
- [Diseño de la arquitectura](docs/superpowers/specs/2026-11-23-piensa-study-site.md)
- [Plan de implementación](docs/superpowers/plans/2026-11-23-piensa-study-site.md)
- [Despliegue en VPS](docs/deployment.md)
