const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

function generateIcon(size, filename) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const radius = size * 0.22;

  // Rounded rectangle background
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = '#0a0a0a';
  ctx.fill();

  // Subtle gold gradient overlay for depth
  const grad = ctx.createRadialGradient(size * 0.35, size * 0.3, 0, size / 2, size / 2, size * 0.65);
  grad.addColorStop(0, 'rgba(212,175,55,0.12)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.beginPath();
  ctx.moveTo(radius, 0);
  ctx.lineTo(size - radius, 0);
  ctx.quadraticCurveTo(size, 0, size, radius);
  ctx.lineTo(size, size - radius);
  ctx.quadraticCurveTo(size, size, size - radius, size);
  ctx.lineTo(radius, size);
  ctx.quadraticCurveTo(0, size, 0, size - radius);
  ctx.lineTo(0, radius);
  ctx.quadraticCurveTo(0, 0, radius, 0);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Scissors emoji / icon
  ctx.fillStyle = '#D4AF37';
  ctx.font = `bold ${size * 0.52}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('\u2702', size / 2, size * 0.44);

  // "BB" wordmark below
  ctx.font = `bold ${size * 0.16}px Arial`;
  ctx.fillText('BB', size / 2, size * 0.78);

  const outPath = path.join(__dirname, '..', 'public', filename);
  fs.writeFileSync(outPath, canvas.toBuffer('image/png'));
  console.log(`\u2713 Generated ${filename} (${size}x${size})`);
}

generateIcon(512, 'icon-512.png');
generateIcon(192, 'icon-192.png');
console.log('\nDone! Icons saved to public/');
