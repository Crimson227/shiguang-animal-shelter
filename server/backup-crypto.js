import {createReadStream,createWriteStream} from 'node:fs';
import {open,lstat} from 'node:fs/promises';
import {Readable,Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

const algorithm = 'aes-256-gcm';
const ivSize = 12, tagSize = 16, overhead = ivSize+tagSize;
export const encryptedSize = bytes => bytes+overhead;
export const backupError = (message,status=422) => Object.assign(new Error(message),{status});

export async function encryptBackupFile(source,destination,key,aad) {
  const iv = randomBytes(ivSize), cipher = createCipheriv(algorithm,key,iv,{authTagLength:tagSize});
  cipher.setAAD(Buffer.from(aad));
  await pipeline(source,cipher,async function* (encrypted) {
    yield iv;
    yield* encrypted;
    yield cipher.getAuthTag();
  },createWriteStream(destination,{flags:'wx',mode:0o600}));
}

export async function decryptBackupFile(source,key,aad,destination,expectedBytes) {
  const stat = await lstat(source);
  if (!stat.isFile() || stat.size<overhead || (expectedBytes!==undefined && stat.size!==encryptedSize(expectedBytes))) {
    throw backupError('备份校验失败，文件大小或类型不符。');
  }
  const input = await open(source,'r');
  try {
    const iv = Buffer.alloc(ivSize), tag = Buffer.alloc(tagSize);
    if ((await input.read(iv,0,ivSize,0)).bytesRead!==ivSize || (await input.read(tag,0,tagSize,stat.size-tagSize)).bytesRead!==tagSize) {
      throw backupError('备份校验失败，文件不完整。');
    }
    const decipher = createDecipheriv(algorithm,key,iv,{authTagLength:tagSize});
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(tag);
    const ciphertext = stat.size===overhead ? Readable.from([])
      : createReadStream(source,{fd:input.fd,autoClose:false,start:ivSize,end:stat.size-tagSize-1});
    const output = typeof destination==='string' ? createWriteStream(destination,{flags:'wx',mode:0o600})
      : destination ?? new Writable({write(_chunk,_encoding,next){next()}});
    try {
      await pipeline(ciphertext,decipher,output);
    } catch (error) {
      if (error.code==='ENOSPC') throw backupError('备份校验需要更多本机可用空间。',507);
      throw backupError('备份校验失败，密钥不匹配或文件已损坏。');
    }
  } finally {
    await input.close();
  }
}
