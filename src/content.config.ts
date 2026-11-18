import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

/**
 * Words live here. Positions live in the Blender exports (public/3d/*.glb).
 * Every schema is strict, so a stray x/y/position in a stop file fails the build.
 */

/** Enquiry types on the contact form. */
export const ENQUIRY = ['Coaching', 'Workshop / facilitation', 'Mediation', 'Website / digital project', 'Event / collaboration', 'Note to self', 'Something else'] as const;

/** The threshold plus the six places you walk to. The file name is the stop id and must match the Blender empties (cam_<id>_pos, …). */
const stops = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/stops' }),
  schema: z
    .object({
      world: z.enum(['threshold', 'human', 'tech']),
      order: z.number().int().min(0),
      place: z.string(),
      picture: z.string(),
      title: z.string(),
      kicker: z.string(),
      summary: z.string(),
      facts: z.array(z.string()),
      say: z.string(),
      cta: z.string(),
      enquiry: z.enum(ENQUIRY),
      action: z.enum(['contact', 'brief']),
      panel: z.enum(['note', 'process', 'archive']).optional(),
    })
    .strict(),
});

/** The two worlds behind the gates. */
const worlds = defineCollection({
  loader: file('src/content/worlds.json'),
  schema: z
    .object({
      id: z.enum(['human', 'tech']),
      label: z.string(),
      gate: z.string(),
      hint: z.string(),
      side: z.enum(['left', 'right']),
    })
    .strict(),
});

/** What Anthony says at the threshold. Stop lines live in each stop's `say`. */
const dialogue = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/dialogue' }),
  schema: z
    .object({
      greeting: z.array(z.string()).min(1),
      returning: z.array(z.string()).min(1),
      lookAround: z.string(),
      entries: z.object({ human: z.string(), tech: z.string() }),
      exits: z.object({ human: z.string(), tech: z.string() }),
      choices: z.object({ look: z.string(), ask: z.string() }),
    })
    .strict(),
});

/** Short scripted questions. The answer is the Markdown body. */
const faq = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/faq' }),
  schema: z.object({ question: z.string(), order: z.number() }).strict(),
});

/** Anthony's pose photos (transparent WebP cut-outs). Point several poses at one file until the real shots exist. */
const anthony = defineCollection({
  loader: file('src/content/anthony.json'),
  schema: z.object({ id: z.enum(['welcome', 'point_left', 'point_right', 'listen', 'walk']), src: z.string() }).strict(),
});

/** Things Anton started or helped build. */
const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    verb: z.string(),
    order: z.number(),
    line: z.string(),
  }),
});

/** Prompts for the "Note to self" draw. */
const notes = defineCollection({
  loader: file('src/content/notes.json'),
  schema: z.object({ text: z.string() }),
});

export const collections = { stops, worlds, dialogue, faq, anthony, projects, notes };
