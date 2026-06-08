/**
 * Convert CoinFlow's JPEG icon (misnamed as .png) to proper multi-size PNG files
 * and then generate a proper .ico file for Windows.
 *
 * Usage: node scripts/generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

async function main() {
  const iconsDir = path.join(__dirname, '..', 'assets', 'icons');
  const sourceFile = path.join(iconsDir, 'icon-512.png'); // Actually a JPEG

  console.log('Source file:', sourceFile);
  console.log('Source size:', fs.statSync(sourceFile).size, 'bytes');

  // Read source into buffer first (avoids file lock issues)
  const sourceBuffer = fs.readFileSync(sourceFile);
  const metadata = await sharp(sourceBuffer).metadata();
  console.log('Source format:', metadata.format, `${metadata.width}x${metadata.height}`);

  // Step 1: Generate proper PNG files from the JPEG source

  // 512px PNG
  const png512Buffer = await sharp(sourceBuffer)
    .resize(512, 512, { fit: 'cover' })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(iconsDir, 'icon-512.png'), png512Buffer);
  console.log('Generated: icon-512.png (' + png512Buffer.length + ' bytes)');

  // 192px PNG
  const png192Buffer = await sharp(sourceBuffer)
    .resize(192, 192, { fit: 'cover' })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(iconsDir, 'icon-192.png'), png192Buffer);
  console.log('Generated: icon-192.png (' + png192Buffer.length + ' bytes)');

  // favicon.png (256px)
  const faviconBuffer = await sharp(sourceBuffer)
    .resize(256, 256, { fit: 'cover' })
    .png()
    .toBuffer();
  fs.writeFileSync(path.join(__dirname, '..', 'favicon.png'), faviconBuffer);
  console.log('Generated: favicon.png (' + faviconBuffer.length + ' bytes)');

  // Step 2: Generate multi-size ICO file
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];

  for (const size of sizes) {
    const buf = await sharp(sourceBuffer)
      .resize(size, size, { fit: 'cover' })
      .png()
      .toBuffer();
    pngBuffers.push({ size, buffer: buf });
    console.log(`  ICO layer ${size}x${size}: ${buf.length} bytes`);
  }

  // Build ICO file
  const numImages = pngBuffers.length;
  const headerSize = 6;
  const dirSize = numImages * 16;
  let dataOffset = headerSize + dirSize;

  // ICO Header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type = ICO
  header.writeUInt16LE(numImages, 4);

  // Directory entries
  const dirEntries = Buffer.alloc(dirSize);
  const imageDataBuffers = [];

  for (let i = 0; i < numImages; i++) {
    const { size, buffer } = pngBuffers[i];
    const offset = i * 16;

    dirEntries.writeUInt8(size >= 256 ? 0 : size, offset + 0);
    dirEntries.writeUInt8(size >= 256 ? 0 : size, offset + 1);
    dirEntries.writeUInt8(0, offset + 2);
    dirEntries.writeUInt8(0, offset + 3);
    dirEntries.writeUInt16LE(1, offset + 4);
    dirEntries.writeUInt16LE(32, offset + 6);
    dirEntries.writeUInt32LE(buffer.length, offset + 8);
    dirEntries.writeUInt32LE(dataOffset, offset + 12);

    imageDataBuffers.push(buffer);
    dataOffset += buffer.length;
  }

  const icoBuffer = Buffer.concat([header, dirEntries, ...imageDataBuffers]);
  const icoPath = path.join(iconsDir, 'icon.ico');

  // Backup old ICO
  const backupPath = path.join(iconsDir, 'icon_old_backup.ico');
  if (fs.existsSync(icoPath)) {
    fs.copyFileSync(icoPath, backupPath);
    console.log('Backed up old icon.ico -> icon_old_backup.ico');
  }

  fs.writeFileSync(icoPath, icoBuffer);
  console.log(`\nGenerated icon.ico: ${icoBuffer.length} bytes with ${numImages} sizes: ${sizes.join(', ')}px`);

  // Verify the new ICO
  const verifyBytes = fs.readFileSync(icoPath);
  const verifyCount = verifyBytes.readUInt16LE(4);
  console.log(`Verification: ICO has ${verifyCount} images`);
  console.log('\nDone! All icon files have been regenerated from your custom design.');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
