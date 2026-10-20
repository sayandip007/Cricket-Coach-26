const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// 1:1 Vector representation of the user uploaded Cricket Simulator app icon
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Radial Gradient -->
    <radialGradient id="bgGlow" cx="50%" cy="45%" r="60%">
      <stop offset="0%" stop-color="#142646"/>
      <stop offset="50%" stop-color="#0a1222"/>
      <stop offset="100%" stop-color="#050810"/>
    </radialGradient>

    <!-- Golden Crest Gradients -->
    <linearGradient id="goldRim" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fde047"/>
      <stop offset="35%" stop-color="#eab308"/>
      <stop offset="70%" stop-color="#ca8a04"/>
      <stop offset="100%" stop-color="#854d0e"/>
    </linearGradient>

    <linearGradient id="goldInner" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ca8a04"/>
      <stop offset="50%" stop-color="#eab308"/>
      <stop offset="100%" stop-color="#713f12"/>
    </linearGradient>

    <!-- Cyan Glow -->
    <radialGradient id="cyanSpark" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.9"/>
      <stop offset="60%" stop-color="#0284c7" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#0369a1" stop-opacity="0"/>
    </radialGradient>

    <!-- Ball Gradient -->
    <radialGradient id="ballShine" cx="35%" cy="35%" r="65%">
      <stop offset="0%" stop-color="#ff7b72"/>
      <stop offset="25%" stop-color="#dc2626"/>
      <stop offset="75%" stop-color="#991b1b"/>
      <stop offset="100%" stop-color="#450a0a"/>
    </radialGradient>

    <!-- Ball Flame Trail -->
    <linearGradient id="ballTrail" x1="0%" y1="50%" x2="100%" y2="50%">
      <stop offset="0%" stop-color="#eab308" stop-opacity="0"/>
      <stop offset="50%" stop-color="#f59e0b" stop-opacity="0.7"/>
      <stop offset="100%" stop-color="#fde047" stop-opacity="0.95"/>
    </linearGradient>

    <!-- Gold Text Gradient -->
    <linearGradient id="goldText" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="50%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#b45309"/>
    </linearGradient>

    <!-- Bat Gradient -->
    <linearGradient id="batWood" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef3c7"/>
      <stop offset="50%" stop-color="#d97706"/>
      <stop offset="100%" stop-color="#78350f"/>
    </linearGradient>

    <!-- Jersey Blue Gradient -->
    <linearGradient id="jerseyBlue" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e3a8a"/>
      <stop offset="50%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>

    <!-- Drop Shadows -->
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000" flood-opacity="0.8"/>
    </filter>
  </defs>

  <!-- 1. Background -->
  <rect width="512" height="512" rx="96" fill="url(#bgGlow)"/>

  <!-- 2. Stadium Floodlight Rays & Dots -->
  <g opacity="0.35">
    <circle cx="120" cy="110" r="3" fill="#fff"/>
    <circle cx="140" cy="105" r="3.5" fill="#fff"/>
    <circle cx="160" cy="110" r="3" fill="#fff"/>
    <circle cx="130" cy="125" r="2.5" fill="#fff"/>
    <circle cx="150" cy="125" r="2.5" fill="#fff"/>

    <circle cx="350" cy="110" r="3" fill="#fff"/>
    <circle cx="370" cy="105" r="3.5" fill="#fff"/>
    <circle cx="390" cy="110" r="3" fill="#fff"/>
    <circle cx="360" cy="125" r="2.5" fill="#fff"/>
    <circle cx="380" cy="125" r="2.5" fill="#fff"/>
  </g>

  <!-- 3. Tech Corner Brackets -->
  <path d="M 32 64 L 32 32 L 64 32" stroke="#38bdf8" stroke-width="3" fill="none" opacity="0.6"/>
  <path d="M 480 64 L 480 32 L 448 32" stroke="#38bdf8" stroke-width="3" fill="none" opacity="0.6"/>
  <path d="M 32 448 L 32 480 L 64 480" stroke="#38bdf8" stroke-width="3" fill="none" opacity="0.6"/>
  <path d="M 480 448 L 480 480 L 448 480" stroke="#38bdf8" stroke-width="3" fill="none" opacity="0.6"/>

  <!-- 4. Outer & Inner Circular Crest Shield -->
  <circle cx="256" cy="225" r="165" fill="#0d1b30" stroke="url(#goldRim)" stroke-width="9" filter="url(#shadow)"/>
  <circle cx="256" cy="225" r="148" fill="none" stroke="url(#goldInner)" stroke-width="2.5" opacity="0.8"/>
  <circle cx="256" cy="225" r="140" fill="#08101e" opacity="0.95"/>

  <!-- 5. Wickets & Bails Shattering with Sparks (Left side) -->
  <g transform="translate(145, 145)">
    <!-- Exploding Sparks -->
    <circle cx="25" cy="20" r="16" fill="#fde047" opacity="0.8"/>
    <line x1="25" y1="20" x2="5" y2="5" stroke="#fef08a" stroke-width="3"/>
    <line x1="25" y1="20" x2="45" y2="8" stroke="#fef08a" stroke-width="2.5"/>
    <line x1="25" y1="20" x2="30" y2="-5" stroke="#fde047" stroke-width="2"/>
    <line x1="25" y1="20" x2="10" y2="35" stroke="#fde047" stroke-width="2"/>

    <!-- Wickets Stumps -->
    <rect x="10" y="25" width="7" height="90" rx="3" fill="#ca8a04" stroke="#fef08a" stroke-width="1"/>
    <rect x="23" y="20" width="7" height="95" rx="3" fill="#eab308" stroke="#fef08a" stroke-width="1" transform="rotate(8 23 20)"/>
    <rect x="36" y="30" width="7" height="85" rx="3" fill="#b45309" stroke="#fde047" stroke-width="1" transform="rotate(18 36 30)"/>

    <!-- Flying Bail -->
    <rect x="5" y="10" width="18" height="5" rx="2" fill="#fef08a" stroke="#ca8a04" stroke-width="1" transform="rotate(-25 5 10)"/>
  </g>

  <!-- 6. Batsman Silhouette & Gear -->
  <!-- Torso / Jersey -->
  <path d="M 215 210 Q 256 195 285 215 L 295 270 L 210 270 Z" fill="url(#jerseyBlue)" stroke="#38bdf8" stroke-width="2.5"/>
  <path d="M 240 215 L 256 250 L 270 215 Z" fill="#0284c7" opacity="0.6"/>

  <!-- Gold Jersey Collar Accent -->
  <path d="M 235 205 Q 256 215 275 205" stroke="#eab308" stroke-width="3.5" fill="none"/>

  <!-- Helmet / Head -->
  <circle cx="256" cy="165" r="28" fill="#0f172a" stroke="#38bdf8" stroke-width="3.5"/>
  <path d="M 230 162 Q 256 150 282 162" fill="none" stroke="#eab308" stroke-width="3"/>
  <!-- Helmet Grill / Visor -->
  <rect x="240" y="166" width="32" height="18" rx="4" fill="#0284c7" opacity="0.8"/>
  <line x1="242" y1="172" x2="270" y2="172" stroke="#fff" stroke-width="1.8"/>
  <line x1="242" y1="178" x2="270" y2="178" stroke="#fff" stroke-width="1.8"/>
  <line x1="256" y1="166" x2="256" y2="184" stroke="#fff" stroke-width="1.8"/>

  <!-- Batting Gloves & Arms -->
  <path d="M 220 220 L 245 240" stroke="#1e3a8a" stroke-width="14" stroke-linecap="round"/>
  <path d="M 280 220 L 260 240" stroke="#1e3a8a" stroke-width="14" stroke-linecap="round"/>
  <!-- Padded Gloves -->
  <rect x="240" y="230" width="16" height="20" rx="6" fill="#f8fafc" stroke="#38bdf8" stroke-width="2"/>
  <rect x="254" y="232" width="16" height="20" rx="6" fill="#f8fafc" stroke="#38bdf8" stroke-width="2"/>

  <!-- Cricket Bat -->
  <g transform="rotate(-38 245 250)">
    <rect x="243" y="195" width="8" height="42" rx="4" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5"/>
    <line x1="247" y1="200" x2="247" y2="235" stroke="#fff" stroke-width="1"/>
    <path d="M 239 237 L 255 237 L 257 325 Q 247 330 237 325 Z" fill="url(#batWood)" stroke="#38bdf8" stroke-width="2.5" filter="url(#shadow)"/>
    <path d="M 243 250 L 247 258 L 251 250" stroke="#38bdf8" stroke-width="2.5" fill="none"/>
    <path d="M 243 260 L 247 268 L 251 260" stroke="#eab308" stroke-width="2.5" fill="none"/>
  </g>

  <!-- 7. Glowing Ball Flight Trail -->
  <path d="M 235 250 Q 300 220 375 220" stroke="url(#ballTrail)" stroke-width="24" fill="none" stroke-linecap="round" opacity="0.8"/>
  <path d="M 255 250 Q 310 222 375 220" stroke="#fef08a" stroke-width="8" fill="none" stroke-linecap="round"/>

  <!-- Sparks around ball -->
  <g fill="#fde047">
    <circle cx="340" cy="195" r="3"/>
    <circle cx="355" cy="245" r="2.5"/>
    <circle cx="325" cy="235" r="2"/>
    <circle cx="380" cy="185" r="3.5"/>
    <circle cx="410" cy="205" r="2.5"/>
    <circle cx="330" cy="210" r="2"/>
  </g>

  <!-- 8. Red Cricket Ball with White Seam -->
  <g transform="translate(375, 220)">
    <circle cx="0" cy="0" r="34" fill="url(#ballShine)" stroke="#fef08a" stroke-width="2" filter="url(#shadow)"/>
    <path d="M -24 -24 Q 0 0 24 24" stroke="#ffffff" stroke-width="3" fill="none" stroke-dasharray="3,2"/>
    <path d="M -23 -25 Q 0 0 25 23" stroke="#fca5a5" stroke-width="1" fill="none"/>
    <circle cx="-10" cy="-12" r="6" fill="#ffffff" opacity="0.6"/>
  </g>

  <!-- 9. Bold Text Emblem Base Banner -->
  <g transform="translate(0, 310)">
    <polygon points="60,60 452,60 422,145 256,170 90,145" fill="#070c17" stroke="url(#goldRim)" stroke-width="4.5" filter="url(#shadow)"/>
    <polygon points="68,66 444,66 416,140 256,162 96,140" fill="#0b1322"/>

    <!-- "CRICKET" 3D Gold Text -->
    <text x="256" y="98"
          font-family="system-ui, -apple-system, sans-serif"
          font-size="64"
          font-weight="900"
          font-style="italic"
          text-anchor="middle"
          letter-spacing="2"
          fill="#1c1003"
          stroke="#000000"
          stroke-width="10">CRICKET</text>
    <text x="256" y="98"
          font-family="system-ui, -apple-system, sans-serif"
          font-size="64"
          font-weight="900"
          font-style="italic"
          text-anchor="middle"
          letter-spacing="2"
          fill="url(#goldText)"
          stroke="#451a03"
          stroke-width="2">CRICKET</text>

    <!-- "SIMULATOR" Electric Cyan Pill Badge -->
    <g transform="translate(136, 110)">
      <rect x="0" y="0" width="240" height="34" rx="8" fill="#03254c" stroke="#38bdf8" stroke-width="2.5" filter="url(#shadow)"/>
      <line x1="8" y1="17" x2="30" y2="17" stroke="#38bdf8" stroke-width="2.5"/>
      <line x1="210" y1="17" x2="232" y2="17" stroke="#38bdf8" stroke-width="2.5"/>
      <text x="120" y="24"
            font-family="system-ui, -apple-system, sans-serif"
            font-size="20"
            font-weight="900"
            letter-spacing="4"
            text-anchor="middle"
            fill="#38bdf8">SIMULATOR</text>
    </g>
  </g>
</svg>`;

async function run() {
  const svgBuffer = Buffer.from(svgContent);

  fs.writeFileSync(path.join(__dirname, '../public/icon.svg'), svgContent);
  fs.writeFileSync(path.join(__dirname, '../public/favicon.svg'), svgContent);
  console.log('Saved public/icon.svg and public/favicon.svg');

  const resDir = path.join(__dirname, '../android/app/src/main/res');
  const densities = [
    { folder: 'mipmap-mdpi', size: 48 },
    { folder: 'mipmap-hdpi', size: 72 },
    { folder: 'mipmap-xhdpi', size: 96 },
    { folder: 'mipmap-xxhdpi', size: 144 },
    { folder: 'mipmap-xxxhdpi', size: 192 }
  ];

  for (const { folder, size } of densities) {
    const dir = path.join(resDir, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const launcherPath = path.join(dir, 'ic_launcher.png');
    const roundPath = path.join(dir, 'ic_launcher_round.png');
    await sharp(svgBuffer).resize(size, size).png().toFile(launcherPath);
    await sharp(svgBuffer).resize(size, size).png().toFile(roundPath);
    console.log(`Generated ${folder} (${size}x${size})`);
  }

  const pwaSizes = [
    { file: 'public/pwa-192x192.png', size: 192 },
    { file: 'public/pwa-512x512.png', size: 512 },
    { file: 'public/pwa-maskable-512x512.png', size: 512 },
    { file: 'public/apple-touch-icon.png', size: 180 }
  ];

  for (const { file, size } of pwaSizes) {
    const fullPath = path.join(__dirname, '../', file);
    await sharp(svgBuffer).resize(size, size).png().toFile(fullPath);
    console.log(`Generated ${file} (${size}x${size})`);
  }

  console.log('All app icons generated successfully!');
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
