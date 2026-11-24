# PIENSE II study site

The site supports one tutor and one learner. The tutor opens or pins the lesson for the next class. The learner can open any lesson and most of its exercises whenever she wants. The same lesson guides the live class. Spaced review is optional.

## Design decisions

- Use a class page with a separate review queue. A queue-first site would put revision ahead of the class the tutor chose. A PDF library would give the learner materials but require manual scheduling and feedback.
- Use a Spanish workbook layout. Give the class title, learning goal, worked example and exercises clear priority. On desktop, keep the lesson beside a short class outline. On phones, stack the same content in reading order.
- Use React, TypeScript, Vite and the FSRS library used by Grind Recall. Store progress on the learner's browser and let her export it to the tutor or another device. Host the static app on the VPS path /piensa/ at math.musel.dev. The public application serves original study content and source links.
- Start with Monday through Friday, 60 minutes per day and the America/Tijuana calendar. Start date defaults to the current local day. The exam date is optional. Open access to the curriculum stays available on all dates.
- Use dated attempts and class records for progress. Recalculate future class dates when preferences change. Preserve the attempt and class histories and the skill's FSRS due date. Allow the tutor to clear a pin and return to the suggested lesson.

## Ready for use

- Each lesson has a goal, prerequisites, a short explanation, a worked example and original four-option questions with hints and solutions. Teach a method in steps. Use new values, contexts or passages in later attempts. Keep the official practice PDF available for a final mock exam.
- Lesson practice gives feedback after submission. The optional review queue starts with a reserved or fresh question, schedules the skill and links back to the lesson. Reward independent correct answers with a longer interval than supported or guessed answers.
- Timed mode uses 42 questions in 35 minutes for Habilidad cognoscitiva, 37 in 30 for Español, 35 in 35 for Matemáticas and 40 in 30 for Inglés. Show answers after a section ends. Allow a shorter timed set to train pace. Treat scores as practice percentages.
- Progress shows daily, Monday–Sunday weekly and calendar-month activity. Show minutes, attempted and correct questions, and class completion. Show skills that need review and example mistakes.
- The plan accepts study days, a daily duration, a start date, a target date and exceptions. Report a shortfall when the planned hours are insufficient. Group classes and recommend study time for a shorter timeline.
- Release requires content validation, working keyboard and touch flows, a production build, a reviewable PR, and HTTPS checks on the VPS.
