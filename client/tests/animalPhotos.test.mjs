import test from 'node:test'
import assert from 'node:assert/strict'
import {animalFrames,photoURL} from '../src/lib/animalPhotos.ts'
import {readFileSync,existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'
test('four fictional photo sets only attach to their exact current cover',()=>{
  for(const id of [45,44,41,27]) {
    const frames=animalFrames(`imgs/animals/editorial-20261022/${id}-cover.webp`)
    assert.equal(frames.length,2);assert.ok(frames.every(frame=>frame.src.includes(`/${id}-`)))
    assert.equal(new Set(frames.map(frame=>frame.src)).size,2)
  }
})

test('all 36 current public animals have distinct complete albums with existing local files',()=>{
  const catalog=JSON.parse(readFileSync(new URL('./fixtures/catalog-covers.json',import.meta.url),'utf8').replace(/^\uFEFF/,''))
  assert.equal(catalog.length,36)
  const extra=new Set()
  for(const animal of catalog){
    const frames=animalFrames(animal.pictureURL)
    assert.equal(frames.length,2,animal.pictureURL)
    assert.equal(frames[0].src,photoURL(animal.pictureURL))
    assert.notEqual(frames[0].src,frames[1].src)
    assert.ok(!extra.has(frames[1].src));extra.add(frames[1].src)
    for(const frame of frames)assert.ok(existsSync(fileURLToPath(new URL('../../server'+frame.src,import.meta.url))),frame.src)
  }
})
test('a new staff cover never inherits photographs from a previous fictional identity',()=>{
  const uploaded='imgs/animals/uploaded-new-photo.jpg'
  assert.deepEqual(animalFrames(uploaded),[{src:'/'+uploaded,caption:'档案照片'}])
  assert.equal(animalFrames('imgs/animals/demo-cat-15.jpg').length,1)
})
test('missing pictures remain missing and URL normalization keeps existing supported formats',()=>{
  assert.deepEqual(animalFrames(null),[])
  assert.equal(photoURL('./imgs/animal.jpg'),'/imgs/animal.jpg')
  assert.equal(photoURL('/imgs/animal.jpg'),'/imgs/animal.jpg')
  assert.equal(photoURL('https://example.test/photo.jpg'),'https://example.test/photo.jpg')
})
