import sharp from 'sharp';

const pngSignature = Buffer.from([137,80,78,71,13,10,26,10]);
const pngEnd = Buffer.from([0,0,0,0,73,69,78,68,174,66,96,130]);
const maxPixels = 16_000_000;
const maxEdge = 6000;
let decoding = 0;

function photoFormat(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 12) return null;
  if (bytes[0]===255 && bytes[1]===216 && bytes.at(-2)===255 && bytes.at(-1)===217) return 'jpeg';
  if (bytes.subarray(0,8).equals(pngSignature) && bytes.subarray(-12).equals(pngEnd)) return 'png';
  if (bytes.toString('ascii',0,4)==='RIFF' && bytes.toString('ascii',8,12)==='WEBP' && bytes.readUInt32LE(4)+8===bytes.length) return 'webp';
  return null;
}

export async function validatePhoto(bytes) {
  const format = photoFormat(bytes);
  if (!format) throw Object.assign(new Error('请选择完整的 JPG、PNG 或 WebP 图片'),{status:400});
  if (decoding>=2) throw Object.assign(new Error('照片正在处理中，请稍后重试'),{status:429});
  decoding++;
  try {
    const image = sharp(bytes,{animated:true,failOn:'warning',limitInputPixels:maxPixels});
    const info = await image.metadata();
    const width = info.width, frameHeight = info.pageHeight ?? info.height, frames = info.pages ?? 1;
    if (info.format!==format || !width || !frameHeight || width>maxEdge || frameHeight>maxEdge || width*frameHeight*frames>maxPixels) {
      throw new Error('invalid image format or dimensions');
    }
    // Metadata can succeed even when the compressed pixels are damaged.
    await image.raw({depth:'uchar'}).toBuffer();
  } catch {
    throw Object.assign(new Error('图片无法完整读取。请使用完整的 JPG、PNG 或 WebP，单边不超过 6000 像素、总像素不超过 1600 万'),{status:400});
  } finally {
    decoding--;
  }
  return format==='jpeg'?'jpg':format;
}
