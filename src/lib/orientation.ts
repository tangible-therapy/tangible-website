import data from '../data/orientation.json';
import { micromark } from 'micromark';

export type Item =
  | { t: 'text'; md: string }
  | { t: 'image'; src: string; alt: string }
  | { t: 'form'; src: string }
  | { t: 'youtube'; id: string; start: string | null }
  | { t: 'wistia'; id: string; title: string }
  | { t: 'sandbox'; href: string; img: string; title: string; text: string; button?: string };
export type Lesson = { slug: string; title: string; chapter: string; sections: Item[][] };

export const lessons = data as Lesson[];
export const chapters = lessons.reduce<{ name: string; lessons: Lesson[] }[]>((acc, l) => {
  const last = acc[acc.length - 1];
  if (last && last.name === l.chapter) last.lessons.push(l);
  else acc.push({ name: l.chapter, lessons: [l] });
  return acc;
}, []);

// Lesson text was exported as light markdown; single line breaks are kept as line breaks.
export const md = (s: string) => micromark(s.replace(/([^\n])\n(?!\n|- |#)/g, '$1  \n'));

export const summary = (l: Lesson) => {
  const first = l.sections[0]?.find((i) => i.t === 'text') as { md: string } | undefined;
  const m = first?.md.match(/##\s*(.+)/);
  return m ? m[1].trim() : '';
};
