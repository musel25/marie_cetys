# PIENSE II study site implementation plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans for implementation.

**Goal** Deliver an exam-aligned workbook, an adjustable calendar, optional spaced review, and a progress record.

**Architecture** Keep the original curriculum in four data files. Derive the class schedule, review queue, and progress from user preferences and dated activity. Build one static application for the VPS.

**Tech stack** React, TypeScript, Vite, ts-fsrs, Node 22 or newer, Playwright, and nginx.

**Spec** See [the design](../specs/2026-11-23-piensa-study-site.md).

## Exam coverage

Use the College Board 2019 study guide, PDF pages 7–11, as the scope. Use the descriptors and practice test to check question formats. Use CETYS for its cognitive skill breakdown. Use CONEA and UNX for additional practice context. List these references in the curriculum. Write original examples, passages, distractors and feedback.

| Area | Learning order |
| --- | --- |
| Habilidad cognoscitiva | Position clues. Metaphors. Analogies. Number and letter sequences. Two-dimensional matrices. Set diagrams. Conditional reasoning. Practical reasoning. |
| Español | Accent and spelling. Word meaning and formation. Verb forms and complements. Sentence order and agreement. Main idea and details. Inference and literary analysis. Paragraph order and cohesion. Punctuation, precision and concision. |
| Matemáticas | Real numbers and operations. Fractions and proportional relationships. Powers and roots. Expressions and one-variable equations and inequalities. Polynomials and factorization. Rational expressions and quadratics. Coordinates, lines, functions and systems. Geometry and measurement. Tables, graphs, central tendency, sample spaces and probability. |
| Inglés | Sentence structure. Verbs and voice. Modifiers and function words. Details, chronology and cause. Inferences, characters and tone. Purpose and text types. Organization and transitions. Punctuation and concise sentence combinations. |

## Study timeline

Use one day per lesson at 60 minutes. Interleave the four exam areas while preserving subject prerequisites. Use the configured calendar to set the next class date. Repack future work when a date or duration changes. Keep completed classes and historical attempts.

A standard class has 5 minutes of diagnosis, 10 minutes for the explanation, 10 minutes for a worked example, 20 minutes of practice, 10 minutes for feedback and 5 minutes for an exit question. Shorter sessions can continue into the next available day. An exam date that leaves insufficient study time shows the uncovered workload and the minimum average minutes required per available day.

For self-study, open the published examples and practice at any time. Select optional review for due skills. Finish a timed section to see answers and links back to the lessons.

After a missed or assisted answer, select a fresh question near the previous level. After an independent correct answer to a base question, prefer an exam-level variant. Keep the challenge questions available to the tutor and the simulator.

## Implementation steps

### 1. Curriculum and integrity

- [ ] Create four JSON lesson banks under `src/content`. Use stable lesson IDs and four options per question.
- [ ] Make one question ID from its lesson ID and exercise position. Append new exercises to preserve IDs.
- [ ] Check complete prerequisites, duplicate prompts, four distinct options and a valid answer for every item.
- [ ] Check the section blueprint and reserve at least one unseen review item per lesson.

### 2. Study rules

- [ ] Define dates, settings, events and storage validation in `src/study.ts`.
- [ ] Test a Monday–Friday week, a short deadline, an exception day, a Saturday review, and a calendar month boundary in `tests/study.test.ts`.
- [ ] Compute calendar dates using local Tijuana day strings and UTC arithmetic for date offsets.
- [ ] Use FSRS to schedule one skill after its first qualifying attempt. A failure and a successful answer with help return sooner than an independent answer that day.
- [ ] Use unseen questions first, then the least recently used question. Add events with stable IDs.
- [ ] Test backup import, duplicate events, and invalid dates. Keep the current state if a file fails validation.

### 3. Workbook and practice

- [ ] Create home, lesson, curriculum, review, progress, exam and settings views.
- [ ] Add a class pin, shareable lesson links, completed-class records, and clear section headings.
- [ ] Build the short lesson flow and tutor outline. Add feedback, a hint, and an optional flag for the tutor.
- [ ] Make the timed section select the official number of items and use a fixed end timestamp. Lock submissions at time expiry and show explanations in the results.

### 4. Progress and planning

- [ ] Show day, week and month summaries. Count active practice time and manually logged class minutes. Keep class time and practice time distinct.
- [ ] Show reviewed and completed skills, accuracy by area and flagged questions. Allow users to export or import a JSON backup.
- [ ] List the dates and skills from the current plan. Show the amount of available study time and the required average for short timelines.

### 5. Review and release

- [ ] Walk through the first class with the tutor. Record feedback and adjust the exposition and difficulty.
- [ ] Test a correct and incorrect answer, hinted review, time expiry, a mobile viewport, date adjustment, and progress after reload.
- [ ] Run `npm run check` and the browser suite.
- [ ] Push the topic branch and open the pull request. Deploy the verified build as a versioned release under /piensa/. Test the page, assets, and existing math site over HTTPS.
