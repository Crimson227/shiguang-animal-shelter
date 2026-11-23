import {supplementalAlbums} from './animalAlbums.ts'
export type AnimalFrame = {src:string;caption:string}
export const photoURL = (raw:unknown) => {
  const value=String(raw||'')
  return !value?'':/^https?:\/\//.test(value)||value.startsWith('/')?value:`/${value.replace(/^\.\/?/,'')}`
}
// User-approved fictional photo sets. A newly uploaded cover opts out of this set.
const sets: Record<string,AnimalFrame[]> = Object.fromEntries([
  ['45','窗边一刻'],['44','午后的陪伴'],['41','庭院里的小步伐'],['27','草地上的一刻'],
].map(([id,caption])=>{
  const base=`/imgs/animals/editorial-20261022/${id}`
  return [`${base}-cover.webp`,[{src:`${base}-cover.webp`,caption:'档案照片'},{src:`${base}-life.webp`,caption}]]
}))
for(const album of supplementalAlbums)sets[album.cover]=[{src:album.cover,caption:'档案照片'},{src:album.src,caption:album.caption}]
export function animalFrames(raw:unknown):AnimalFrame[] {
  const src=photoURL(raw)
  return !src?[]:sets[src]||[{src,caption:'档案照片'}]
}
