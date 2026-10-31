# Sight Words

A mobile-first sight-word game with three modes:

- **Flash Cards** shows one big word. Tap **Read it to me**, or move with **Next**, **Previous**, a swipe, or the arrow keys.
- **Build a Sentence** deals a few words from the deck you picked. Tap or drag them into a short sentence. **Check** accepts any fair English sentence, not one fixed answer.
- **Story Time** is a set of short retellings of public-domain folk tales. Read a story, tap a word to hear it, then answer a few questions.

The look follows the [math fluency game](https://github.com/xtabi2/math-fluency-game): Vite, React, and large colorful buttons on a warm background.

The look and stack follow the [math fluency game](https://github.com/xtabi2/math-fluency-game): Vite, React, and large colorful buttons on a warm background.

## Word lists

Ohio's [Department of Education and Workforce](https://education.ohio.gov/) does not publish a statewide sight-word list. Kindergarten, 1st grade, and 2nd grade in this game are the **Big Walnut Local Schools** (Ohio) High Frequency Words Assessment lists, revised 2026. Cards follow the sheets from top to bottom, one column at a time.

| Grade | Source | Words |
| --- | --- | --- |
| Kindergarten | Big Walnut High Frequency Words Assessment, revised 2026 | 65 |
| 1st Grade | Big Walnut High Frequency Words Assessment, revised 2026 | 60 |
| 2nd Grade | Big Walnut High Frequency Words Assessment, revised 2026 | 75 |
| 3rd Grade | Dolch third-grade service words | 41 |

Big Walnut's assessment photos cover kindergarten through 2nd grade. 3rd grade uses Edward William Dolch's third-grade list from "A Basic Sight Vocabulary," *The Elementary School Journal* 36, no. 6 (1936): 456–460 (a readable reprint is [sightwords.com](https://sightwords.com/sight-words/dolch/)). That is the list Ohio districts commonly use when the state does not publish its own.

## Class Words

Class Words is a separate deck from the child's Core Knowledge Language Arts (CKLA) take-home word cards:

| Set | Words |
| --- | --- |
| Skills 1, lesson 25.1 | 12 |
| Skills 2, lesson 1.1 | 12 |
| All together | 22 |

All together plays both lessons and keeps the first copy of a repeated word. `the` and `all` appear on both sheets, so they are practiced once in that set.

Tricky letters stay underlined on the card, matching the sheets: the *a* in all, the *wo* in two, the final *e* in have, the *e* in the, and the whole word one.

Add a later lesson by appending an object to the `lessons` array in `src/class-words.js`.

## Build a Sentence

The checker lives in `src/grade-sentence.js`. It allows more than one right answer. `I can see you` passes, and `you can see I` does not. `The big pig can run` and `The pig can run` both pass. A singular noun still needs a verb that agrees, so `The big pig run` does not.

Word sets are in `src/sentence-sets.js`. Each set uses only words from that deck, and at least one order is a real sentence. Add a set there when you want more practice.

## Story Time

The stories are original 5 or 6 sentence retellings of public-domain tales: The Three Little Pigs, Goldilocks, The Tortoise and the Hare, The Little Red Hen, The Gingerbread Man, The Three Billy Goats Gruff, The Ugly Duckling, and Jack and the Beanstalk. Pictures are original SVG drawings. Add a story by appending an object to `src/stories.js`.

## Run locally

```bash
npm install
npm run dev
```

`npm run build` writes a static site to `dist/`.

Speech uses the browser's built-in `speechSynthesis` API. No API key is required. A browser that blocks autoplay still speaks when the child taps the button.

## Family PIN gate

Every page is behind a family PIN (`middleware.js`, Vercel Routing Middleware; logic in `pin-gate/gate.mjs`, tests in `pin-gate/gate.unit.mjs`).

- Needs Vercel env vars `FAMILY_PIN` and `PIN_COOKIE_SECRET` (production + preview). Without them the site stays locked.
- `/__pin` is the PIN pad, `/__pin/verify` checks the PIN (constant-time) and sets a signed, httpOnly cookie for one year. Static assets are not gated.
- Wrong PINs wait about 1 second; 5 wrong tries lock the pad for 5 minutes.
- Changing `FAMILY_PIN` or `PIN_COOKIE_SECRET` signs every device out.
