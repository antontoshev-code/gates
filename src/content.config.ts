import { defineCollection } from 'astro:content';
import { glob, file } from 'astro/loaders';
import { z } from 'astro/zod';

/** Offers shown in the People and Technology worlds. One Markdown file each; body = the "more" text. */
const offers = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/offers' }),
  schema: z.object({
    world: z.enum(['people', 'technology']),
    order: z.number(),
    kicker: z.string(),
    status: z.string(),
    title: z.string(),
    summary: z.string(),
    cta: z.string(),
    ctaHref: z.string(),
    draft: z.boolean().default(false),
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

export const collections = { offers, projects, notes };
