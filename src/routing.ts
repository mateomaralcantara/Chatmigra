// Client-side routes served by vercel.json rewrites.
export type View = 'chat' | 'dashboard' | 'tutor';

export function viewFromPath(path: string): View {
  if (path === '/tutor' || path.startsWith('/tutor/')) return 'tutor';
  if (path === '/work') return 'dashboard';
  return 'chat';
}

export function pathForView(view: View): string {
  return view === 'tutor' ? '/tutor' : view === 'dashboard' ? '/work' : '/';
}
