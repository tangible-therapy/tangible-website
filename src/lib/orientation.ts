import data from '../data/orientation.json';
import { renderWithChanges } from './changes';

export type Item =
  | { t: 'text'; md: string }
  | { t: 'image'; src: string; alt: string }
  | { t: 'form'; src: string }
  | { t: 'quiz'; intro?: string; questions: QuizQuestion[] }
  | { t: 'youtube'; id: string; start: string | null; title?: string }
  | { t: 'wistia'; id: string; title: string }
  | { t: 'sandbox'; href: string; img: string; title: string; text: string; button?: string };
// On-page quiz (replaced the Google Form quizzes, Oct 2026). `answer` = indexes of the correct options;
// `many` = select all that apply; `review` = title of the lesson to point to when it's answered wrong.
export type QuizQuestion = { q: string; many?: boolean; options: string[]; answer: number[]; review?: string };
export type Lesson = { slug: string; title: string; chapter: string; sections: Item[][] };

export const lessons = data as Lesson[];
export const quizOf = (l: Lesson) => l.sections.flat().find((i) => i.t === 'quiz') as Extract<Item, { t: 'quiz' }> | undefined;
// Lessons that hold a quiz. Every lesson after one stays locked until that quiz is passed with 100%.
export const quizSlugs = lessons.filter((l) => quizOf(l)).map((l) => l.slug);
export const chapters = lessons.reduce<{ name: string; lessons: Lesson[] }[]>((acc, l) => {
  const last = acc[acc.length - 1];
  if (last && last.name === l.chapter) last.lessons.push(l);
  else acc.push({ name: l.chapter, lessons: [l] });
  return acc;
}, []);

// Lesson text was exported as light markdown; single line breaks are kept as line breaks.
// Review markers ({+new+}, {-removed-}, :::new blocks) are explained in src/lib/changes.ts.
export const md = (s: string) => renderWithChanges(s.replace(/([^\n])\n(?!\n|- |#)/g, '$1  \n'));

export const summary = (l: Lesson) => {
  const first = l.sections[0]?.find((i) => i.t === 'text') as { md: string } | undefined;
  const m = first?.md.match(/##\s*(.+)/);
  return m ? m[1].trim() : '';
};
