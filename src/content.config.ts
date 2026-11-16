import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

/** Explorable spots inside each world. x/y are positions in the wide scene image (0–1). */
const stops = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/stops' }),
  schema: z.object({
    world: z.enum(['people', 'technology']),
    order: z.number(),
    place: z.string(),
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    kicker: z.string(),
    title: z.string(),
    summary: z.string(),
    more: z.string().optional(),
    cta: z.string(),
    ctaHref: z.string(),
    panel: z.enum(['note', 'contact', 'process', 'brief']).optional(),
  }),
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

export const collections = { stops, projects, notes };
