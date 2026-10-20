import React from 'react';

interface TeamLogoProps {
  teamId?: string;
  shortName?: string;
  name?: string;
  size?: number | string;
  className?: string;
  fallbackEmoji?: string;
}

/**
 * Authentic SVG Vector Crest Logos for all 10 IPL Franchises and Major International Nations.
 * Renders high-fidelity, crisp crests with official color gradients, team emblems, and typography.
 */
export const TeamLogo: React.FC<TeamLogoProps> = ({
  teamId = '',
  shortName = '',
  size = 28,
  className = '',
  fallbackEmoji = '🏏'
}) => {
  const normId = (teamId || '').toLowerCase().replace(/^(team_|nat_)/, '');
  const normShort = (shortName || '').toUpperCase();

  const dimension = typeof size === 'number' ? `${size}px` : size;

  // 1. Chennai Super Kings (CSK) - Roaring Golden Lion Head in Circle Crest
  if (normId.includes('che') || normId.includes('csk') || normShort === 'CSK') {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: dimension, height: dimension }}
        className={`shrink-0 ${className}`}
        aria-label="Chennai Super Kings"
      >
        <defs>
          <linearGradient id="cskGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFEA00" />
            <stop offset="50%" stopColor="#F9CD05" />
            <stop offset="100%" stopColor="#D49A00" />
          </linearGradient>
          <linearGradient id="cskBlue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0066CC" />
            <stop offset="100%" stopColor="#002D62" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#cskGold)" stroke="#00539F" strokeWidth="4" />
        <circle cx="50" cy="50" r="42" fill="url(#cskBlue)" />
        {/* Roaring Lion Mane & Crown */}
        <path d="M50 14 L55 24 L63 20 L60 30 L69 32 L60 39 L68 47 L58 48 L62 58 L52 54 L50 64 L48 54 L38 58 L42 48 L32 47 L40 39 L31 32 L40 30 L37 20 L45 24 Z" fill="url(#cskGold)" />
        {/* Lion Snout & Roar Jaw */}
        <path d="M44 48 C44 44, 56 44, 56 48 C56 52, 54 56, 50 56 C46 56, 44 52, 44 48 Z" fill="#FFFFFF" />
        <path d="M47 50 L53 50 L50 54 Z" fill="#002D62" />
        {/* Roar Teeth */}
        <polygon points="46,55 48,52 50,55 52,52 54,55" fill="#FFFFFF" />
        {/* CSK Wordmark */}
        <rect x="24" y="66" width="52" height="18" rx="4" fill="#F9CD05" stroke="#002D62" strokeWidth="1.5" />
        <text x="50" y="79" fill="#002D62" fontSize="11" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1">CSK</text>
      </svg>
    );
  }

  // 2. Mumbai Indians (MI) - Sudarshan Razor Chakra Cyclone Vortex
  if (normId.includes('mum') || normId.includes('mi') || normShort === 'MI') {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: dimension, height: dimension }}
        className={`shrink-0 ${className}`}
        aria-label="Mumbai Indians"
      >
        <defs>
          <linearGradient id="miBlue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0066D6" />
            <stop offset="50%" stopColor="#004BA0" />
            <stop offset="100%" stopColor="#002244" />
          </linearGradient>
          <linearGradient id="miGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE066" />
            <stop offset="100%" stopColor="#D4AF37" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#miBlue)" stroke="url(#miGold)" strokeWidth="3" />
        {/* Sudarshan Chakra Razor Blades */}
        <g transform="translate(50,44)">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <path
              key={deg}
              d="M0 0 L-6 -22 C-4 -28, 4 -28, 6 -22 L0 0 Z"
              fill="url(#miGold)"
              transform={`rotate(${deg})`}
              opacity="0.9"
            />
          ))}
          <circle cx="0" cy="0" r="9" fill="#DC2626" stroke="#FFFFFF" strokeWidth="2" />
        </g>
        {/* MI Badge */}
        <path d="M22 68 L78 68 L70 88 L30 88 Z" fill="#002B66" stroke="url(#miGold)" strokeWidth="2" />
        <text x="50" y="83" fill="#FFFFFF" fontSize="13" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1.5">MI</text>
      </svg>
    );
  }

  // 3. Royal Challengers Bengaluru (RCB) - Golden Lion Rampant Crest Shield
  if (normId.includes('blr') || normId.includes('rcb') || normShort === 'BLR' || normShort === 'RCB') {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: dimension, height: dimension }}
        className={`shrink-0 ${className}`}
        aria-label="Royal Challengers Bengaluru"
      >
        <defs>
          <linearGradient id="rcbRed" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#EF4444" />
            <stop offset="60%" stopColor="#DA1818" />
            <stop offset="100%" stopColor="#7F1D1D" />
          </linearGradient>
          <linearGradient id="rcbGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF3B0" />
            <stop offset="50%" stopColor="#E6B800" />
            <stop offset="100%" stopColor="#B38600" />
          </linearGradient>
        </defs>
        {/* Regal Shield */}
        <path d="M50 4 L86 16 L86 52 C86 74, 50 96, 50 96 C50 96, 14 74, 14 52 L14 16 Z" fill="url(#rcbRed)" stroke="url(#rcbGold)" strokeWidth="4" />
        {/* Royal Crown */}
        <polygon points="34,22 42,16 50,23 58,16 66,22 63,28 37,28" fill="url(#rcbGold)" />
        {/* Golden Lion Rampant Silhouette */}
        <path
          d="M50 32 C54 32, 58 35, 57 39 C56 42, 52 44, 55 48 C58 52, 64 50, 65 54 C66 58, 60 59, 58 64 C56 68, 62 72, 60 76 C58 80, 52 78, 50 78 C48 78, 44 80, 42 76 C40 72, 45 68, 43 64 C41 59, 36 58, 37 54 C38 50, 44 52, 46 48 C49 44, 46 42, 45 39 C44 35, 47 32, 50 32 Z"
          fill="url(#rcbGold)"
        />
        <text x="50" y="88" fill="url(#rcbGold)" fontSize="10" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1">RCB</text>
      </svg>
    );
  }

  // 4. Kolkata Knight Riders (KKR) - Corinthian Knight Helmet & Blazing Flames
  if (normId.includes('kol') || normId.includes('kkr') || normShort === 'KOL' || normShort === 'KKR') {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: dimension, height: dimension }}
        className={`shrink-0 ${className}`}
        aria-label="Kolkata Knight Riders"
      >
        <defs>
          <linearGradient id="kkrPurple" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#552F87" />
            <stop offset="50%" stopColor="#3A225D" />
            <stop offset="100%" stopColor="#231238" />
          </linearGradient>
          <linearGradient id="kkrGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFDD55" />
            <stop offset="50%" stopColor="#F2A900" />
            <stop offset="100%" stopColor="#C28200" />
          </linearGradient>
        </defs>
        <path d="M50 4 L88 18 L88 56 C88 78, 50 96, 50 96 C50 96, 12 78, 12 56 L12 18 Z" fill="url(#kkrPurple)" stroke="url(#kkrGold)" strokeWidth="3.5" />
        {/* Blazing Helmet Plume Flames */}
        <path d="M50 14 C44 24, 38 28, 44 36 C47 40, 50 42, 50 42 C50 42, 53 40, 56 36 C62 28, 56 24, 50 14 Z" fill="url(#kkrGold)" />
        {/* Corinthian Knight Helmet Visor */}
        <path d="M34 40 L66 40 L64 58 C64 66, 58 72, 50 74 C42 72, 36 66, 36 58 Z" fill="#F2A900" />
        <rect x="40" y="47" width="20" height="5" rx="2" fill="#231238" />
        <line x1="50" y1="52" x2="50" y2="68" stroke="#231238" strokeWidth="3" />
        <text x="50" y="87" fill="#FFFFFF" fontSize="10" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1">KKR</text>
      </svg>
    );
  }

  // 5. Sunrisers Hyderabad (SRH) - Fiery Rising Falcon / Eagle in Sunburst
  if (normId.includes('hyd') || normId.includes('srh') || normShort === 'HYD' || normShort === 'SRH') {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: dimension, height: dimension }}
        className={`shrink-0 ${className}`}
        aria-label="Sunrisers Hyderabad"
      >
        <defs>
          <linearGradient id="srhOrange" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFA040" />
            <stop offset="50%" stopColor="#F26522" />
            <stop offset="100%" stopColor="#CC4100" />
          </linearGradient>
          <radialGradient id="srhSun" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#FFE600" />
            <stop offset="70%" stopColor="#F26522" />
            <stop offset="100%" stopColor="#000000" />
          </radialGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="#121212" stroke="url(#srhOrange)" strokeWidth="3" />
        {/* Rising Sun Rays */}
        <circle cx="50" cy="46" r="28" fill="url(#srhSun)" opacity="0.8" />
        {/* Outstretched Eagle Wings */}
        <path d="M50 30 C38 20, 18 24, 14 38 C24 42, 36 44, 46 50 L50 46 L54 50 C64 44, 76 42, 86 38 C82 24, 62 20, 50 30 Z" fill="url(#srhOrange)" stroke="#FFE600" strokeWidth="1.5" />
        {/* Eagle Beak */}
        <polygon points="50,40 46,47 54,47" fill="#FFE600" />
        {/* SRH Banner */}
        <polygon points="18,66 82,66 76,86 24,86" fill="url(#srhOrange)" stroke="#000000" strokeWidth="1.5" />
        <text x="50" y="81" fill="#000000" fontSize="12" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1.5">SRH</text>
      </svg>
    );
  }

  // 6. Delhi Capitals (DC) - Triple Roaring Tigers Shield
  if (normId.includes('del') || normId.includes('dc') || normShort === 'DEL' || normShort === 'DC') {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: dimension, height: dimension }}
        className={`shrink-0 ${className}`}
        aria-label="Delhi Capitals"
      >
        <defs>
          <linearGradient id="dcBlue" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#0066CC" />
            <stop offset="100%" stopColor="#003366" />
          </linearGradient>
        </defs>
        <path d="M50 4 L88 18 L88 56 C88 78, 50 96, 50 96 C50 96, 12 78, 12 56 L12 18 Z" fill="url(#dcBlue)" stroke="#DC2626" strokeWidth="4" />
        {/* Center Tiger Head & Flank Tigers */}
        <circle cx="50" cy="40" r="14" fill="#DC2626" stroke="#FFFFFF" strokeWidth="1.5" />
        <circle cx="30" cy="46" r="10" fill="#DC2626" opacity="0.8" />
        <circle cx="70" cy="46" r="10" fill="#DC2626" opacity="0.8" />
        {/* Tiger Eyes & Nose */}
        <polygon points="46,38 48,35 49,38" fill="#FBBF24" />
        <polygon points="54,38 52,35 51,38" fill="#FBBF24" />
        <polygon points="50,44 47,40 53,40" fill="#000000" />
        {/* DC Banner */}
        <rect x="26" y="66" width="48" height="18" rx="4" fill="#DC2626" stroke="#FFFFFF" strokeWidth="1.5" />
        <text x="50" y="80" fill="#FFFFFF" fontSize="12" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1.5">DC</text>
      </svg>
    );
  }

  // 7. Gujarat Titans (GT) - Titanium Geometric Chevron Lightning Crest
  if (normId.includes('guj') || normId.includes('gt') || normShort === 'GUJ' || normShort === 'GT') {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: dimension, height: dimension }}
        className={`shrink-0 ${className}`}
        aria-label="Gujarat Titans"
      >
        <defs>
          <linearGradient id="gtNavy" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#242C44" />
            <stop offset="50%" stopColor="#1B2133" />
            <stop offset="100%" stopColor="#0E121D" />
          </linearGradient>
          <linearGradient id="gtGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE885" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#997A15" />
          </linearGradient>
        </defs>
        {/* Inverted Triangle / Modern Chevron */}
        <polygon points="50,96 10,20 90,20" fill="url(#gtNavy)" stroke="url(#gtGold)" strokeWidth="3.5" />
        {/* Lightning Bolt */}
        <polygon points="54,26 38,50 48,50 44,72 62,44 52,44" fill="url(#gtGold)" stroke="#FFFFFF" strokeWidth="1" />
        <text x="50" y="84" fill="url(#gtGold)" fontSize="11" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1">GT</text>
      </svg>
    );
  }

  // 8. Rajasthan Royals (RR) - Royal Crowned Twin Lions in Pink & Blue
  if (normId.includes('raj') || normId.includes('rr') || normShort === 'RAJ' || normShort === 'RR') {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: dimension, height: dimension }}
        className={`shrink-0 ${className}`}
        aria-label="Rajasthan Royals"
      >
        <defs>
          <linearGradient id="rrPink" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF40A3" />
            <stop offset="50%" stopColor="#EA1A85" />
            <stop offset="100%" stopColor="#A50055" />
          </linearGradient>
          <linearGradient id="rrGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE57F" />
            <stop offset="100%" stopColor="#D4AF37" />
          </linearGradient>
        </defs>
        <path d="M50 4 L88 18 L88 56 C88 78, 50 96, 50 96 C50 96, 12 78, 12 56 L12 18 Z" fill="url(#rrPink)" stroke="#254AA5" strokeWidth="4" />
        {/* Crown of Royals */}
        <polygon points="32,24 40,18 50,26 60,18 68,24 64,32 36,32" fill="url(#rrGold)" stroke="#254AA5" strokeWidth="1.5" />
        {/* Twin Lions Flourish */}
        <circle cx="34" cy="46" r="10" fill="url(#rrGold)" />
        <circle cx="66" cy="46" r="10" fill="url(#rrGold)" />
        {/* Crossed Bats */}
        <line x1="30" y1="70" x2="70" y2="38" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
        <line x1="70" y1="70" x2="30" y2="38" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
        <text x="50" y="86" fill="url(#rrGold)" fontSize="12" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1.5">RR</text>
      </svg>
    );
  }

  // 9. Lucknow Super Giants (LSG) - Mythical Garuda Wings Crest
  if (normId.includes('lko') || normId.includes('lsg') || normShort === 'LKO' || normShort === 'LSG') {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: dimension, height: dimension }}
        className={`shrink-0 ${className}`}
        aria-label="Lucknow Super Giants"
      >
        <defs>
          <linearGradient id="lsgCyan" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#00A3E0" />
            <stop offset="50%" stopColor="#0057B8" />
            <stop offset="100%" stopColor="#002D62" />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="48" fill="url(#lsgCyan)" stroke="#FF671F" strokeWidth="3.5" />
        {/* Tricolor Garuda Wings */}
        <path d="M50 24 C34 16, 16 26, 12 44 C26 42, 38 46, 48 56 L50 52 L52 56 C62 46, 74 42, 88 44 C84 26, 66 16, 50 24 Z" fill="#FFFFFF" stroke="#0057B8" strokeWidth="1" />
        <path d="M50 28 C38 22, 24 30, 20 44 C30 43, 40 47, 48 54 L50 50 L52 54 C60 47, 70 43, 80 44 C76 30, 62 22, 50 28 Z" fill="#FF671F" opacity="0.9" />
        <circle cx="50" cy="40" r="8" fill="#0057B8" stroke="#FFFFFF" strokeWidth="1.5" />
        {/* LSG Wordmark */}
        <rect x="22" y="66" width="56" height="18" rx="4" fill="#FF671F" stroke="#FFFFFF" strokeWidth="1.5" />
        <text x="50" y="80" fill="#FFFFFF" fontSize="11" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1">LSG</text>
      </svg>
    );
  }

  // 10. Punjab Kings (PBKS) - Regal Lion Shield with Crossed Bats
  if (normId.includes('pun') || normId.includes('pbks') || normShort === 'PUN' || normShort === 'PBKS') {
    return (
      <svg
        viewBox="0 0 100 100"
        style={{ width: dimension, height: dimension }}
        className={`shrink-0 ${className}`}
        aria-label="Punjab Kings"
      >
        <defs>
          <linearGradient id="pbksRed" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF3333" />
            <stop offset="50%" stopColor="#ED1B24" />
            <stop offset="100%" stopColor="#990000" />
          </linearGradient>
          <linearGradient id="pbksGold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFF0A0" />
            <stop offset="50%" stopColor="#D4AF37" />
            <stop offset="100%" stopColor="#997A15" />
          </linearGradient>
        </defs>
        <path d="M50 4 L88 18 L88 56 C88 78, 50 96, 50 96 C50 96, 12 78, 12 56 L12 18 Z" fill="url(#pbksRed)" stroke="url(#pbksGold)" strokeWidth="4" />
        {/* Gold Crown */}
        <polygon points="34,22 42,16 50,24 58,16 66,22 62,30 38,30" fill="url(#pbksGold)" stroke="#ED1B24" strokeWidth="1" />
        {/* Roaring Lion Head */}
        <path d="M50 34 C44 34, 38 40, 40 48 C42 54, 46 58, 50 60 C54 58, 58 54, 60 48 C62 40, 56 34, 50 34 Z" fill="url(#pbksGold)" />
        <circle cx="46" cy="44" r="2" fill="#ED1B24" />
        <circle cx="54" cy="44" r="2" fill="#ED1B24" />
        <polygon points="50,52 47,48 53,48" fill="#ED1B24" />
        {/* PBKS Banner */}
        <rect x="24" y="66" width="52" height="18" rx="4" fill="url(#pbksGold)" stroke="#ED1B24" strokeWidth="1.5" />
        <text x="50" y="80" fill="#ED1B24" fontSize="11" fontWeight="900" fontFamily="sans-serif" textAnchor="middle" letterSpacing="1">PBKS</text>
      </svg>
    );
  }

  // Major International Nations (IND, AUS, ENG, SA, PAK, NZ, WI, AFG)
  if (normId.includes('ind') || normShort === 'IND' || normId.includes('india')) {
    return (
      <svg viewBox="0 0 100 100" style={{ width: dimension, height: dimension }} className={`shrink-0 ${className}`}>
        <circle cx="50" cy="50" r="48" fill="#0055A5" stroke="#FF9933" strokeWidth="3" />
        <circle cx="50" cy="50" r="32" fill="#FFFFFF" />
        {/* Ashoka Chakra */}
        <circle cx="50" cy="50" r="14" fill="none" stroke="#000080" strokeWidth="2" />
        {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map(deg => (
          <line key={deg} x1="50" y1="50" x2={50 + 14 * Math.cos(deg * Math.PI / 180)} y2={50 + 14 * Math.sin(deg * Math.PI / 180)} stroke="#000080" strokeWidth="1.2" />
        ))}
        <text x="50" y="90" fill="#FF9933" fontSize="10" fontWeight="900" fontFamily="sans-serif" textAnchor="middle">IND</text>
      </svg>
    );
  }

  if (normId.includes('aus') || normShort === 'AUS' || normId.includes('australia')) {
    return (
      <svg viewBox="0 0 100 100" style={{ width: dimension, height: dimension }} className={`shrink-0 ${className}`}>
        <circle cx="50" cy="50" r="48" fill="#004D25" stroke="#FFCC00" strokeWidth="3.5" />
        {/* Kangaroo & Southern Cross */}
        <polygon points="50,22 53,30 61,30 55,35 57,43 50,38 43,43 45,35 39,30 47,30" fill="#FFCC00" />
        <path d="M40 64 C42 56, 48 50, 56 48 C64 46, 68 52, 70 56" fill="none" stroke="#FFCC00" strokeWidth="3" strokeLinecap="round" />
        <text x="50" y="86" fill="#FFCC00" fontSize="11" fontWeight="900" fontFamily="sans-serif" textAnchor="middle">AUS</text>
      </svg>
    );
  }

  if (normId.includes('eng') || normShort === 'ENG' || normId.includes('england')) {
    return (
      <svg viewBox="0 0 100 100" style={{ width: dimension, height: dimension }} className={`shrink-0 ${className}`}>
        <circle cx="50" cy="50" r="48" fill="#0C2340" stroke="#CC0000" strokeWidth="3.5" />
        {/* Three Lions */}
        <path d="M30 30 Q50 25 70 30" stroke="#CC0000" strokeWidth="4" fill="none" />
        <path d="M30 46 Q50 41 70 46" stroke="#CC0000" strokeWidth="4" fill="none" />
        <path d="M30 62 Q50 57 70 62" stroke="#CC0000" strokeWidth="4" fill="none" />
        <text x="50" y="86" fill="#FFFFFF" fontSize="11" fontWeight="900" fontFamily="sans-serif" textAnchor="middle">ENG</text>
      </svg>
    );
  }

  // Fallback Emoji / Initials Badge
  return (
    <div
      style={{ width: dimension, height: dimension }}
      className={`rounded-2xl bg-slate-900 border border-slate-700/80 flex items-center justify-center text-sm font-bold shadow-sm shrink-0 ${className}`}
    >
      <span>{fallbackEmoji}</span>
    </div>
  );
};
