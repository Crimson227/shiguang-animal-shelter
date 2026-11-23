export const shortlistKey='shiguang:shortlist:v1'
export const shortlistLimit=12
export function normalizeShortlist(value:unknown):number[]{
  return Array.isArray(value)?[...new Set(value.filter((id):id is number=>typeof id==='number'&&Number.isSafeInteger(id)&&id>0))].slice(0,shortlistLimit):[]
}
export function parseShortlist(raw:string|null):number[]{
  try{return normalizeShortlist(JSON.parse(raw||'[]'))}catch{return []}
}
export function toggleShortlist(ids:number[],id:number):number[]{
  const clean=normalizeShortlist(ids)
  if(!Number.isSafeInteger(id)||id<=0)return clean
  return clean.includes(id)?clean.filter(value=>value!==id):clean.length<shortlistLimit?[...clean,id]:clean
}
