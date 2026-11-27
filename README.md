# Marie CETYS

A Spanish-language PIENSE II study site with tutor-led lessons, exam-style exercises, and spaced review.

The default plan includes sixty minutes per day from Monday through Friday. The lesson material is open for optional practice at any time.

## Uso

- Abre **Clase de hoy** para ver la lección sugerida. En una lección, elige **Fijar como clase de hoy** o copia el enlace para compartirla.
- Pulsa **Iniciar clase** en **Clase de hoy** o en una lección para arrancar el cronómetro. Si tienes temas pendientes, la app abre el repaso breve. Elige **Continuar a la clase** al terminar. Si estás al día, la app abre la lección directamente.
- En cada bloque de la lección, resuelve el ejemplo y el ejercicio guiado. Abre **Practicar otra vez** para resolver un segundo ejercicio. Al final de la explicación, haz el **Miniexamen** de 15 preguntas.
- El cronómetro de clase sigue en el miniexamen. Usa **Pausar** y **Reanudar** durante un descanso. Pulsa **Guardar clase** para registrar los minutos medidos. Usa **Ajustar minutos** si necesitas corregirlos. Usa **Registrar tiempo manual** para anotar una clase que ya terminó.
- Abre **Guía para la clase** para ver la secuencia de la sesión.
- En **Repaso**, elige el repaso diario para practicar una pregunta por tema pendiente. Como práctica adicional, elige **Empezar repaso largo** para resolver hasta 15 preguntas de temas que ya estudiaste, incluso si estás al día.
- En **Plan**, selecciona los días, minutos por sesión, fecha de inicio, fecha del examen y días libres.
- En **Próximas clases**, pulsa una fecha para cambiar sus minutos. Si el día no aparece en la lista, selecciónalo en **Tiempo por fecha**.
- En **Progreso**, selecciona **Día**, **Semana** o **Mes**. El tiempo del miniexamen que coincide con la clase cuenta una sola vez. Los registros anteriores conservan los minutos anotados.
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
