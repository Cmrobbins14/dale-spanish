// Chispa — the app's original coach character: a friendly young jaguar
// with a sweatband, a jersey and a whistle. Pure SVG + CSS animation
// (see app.css). The head matches the app icon (public/icons/icon.svg).

export function Coach({ size = 96, talking = false, cheer = false }) {
  return (
    <div class={`coach${talking ? ' talking' : ''}${cheer ? ' cheer' : ''}`} style={{ width: size }} aria-hidden="true">
      <svg viewBox="0 0 120 132" width={size} height={size * 1.1}>
        <defs>
          <clipPath id="chispa-head"><circle cx="256" cy="280" r="150" /></clipPath>
        </defs>
        <g class="c-body">
          {/* jersey + whistle */}
          <path d="M22 132c2-22 17-34 38-34s36 12 38 34Z" fill="#5B4BFF" />
          <path d="M48 99l12 12 12-12" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" />
          <text x="60" y="128" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="15" fill="#fff">1</text>
          <path d="M44 98c4 6 9 9 16 9s12-3 16-9" fill="none" stroke="#FFC93C" stroke-width="2" />
          <rect x="74" y="104" width="12" height="7" rx="3" fill="#C9CEDF" />
          {/* head (drawn at icon scale, then shrunk to fit) */}
          <g transform="matrix(0.2533 0 0 0.2533 -4.85 -14.93)">
            <path d="M104 206 L122 92 L206 146 Z" fill="#F4A12F" stroke="#F4A12F" stroke-width="34" stroke-linejoin="round" />
            <path d="M408 206 L390 92 L306 146 Z" fill="#F4A12F" stroke="#F4A12F" stroke-width="34" stroke-linejoin="round" />
            <path d="M132 176 L140 124 L180 150 Z" fill="#FFD9A0" stroke="#FFD9A0" stroke-width="12" stroke-linejoin="round" />
            <path d="M380 176 L372 124 L332 150 Z" fill="#FFD9A0" stroke="#FFD9A0" stroke-width="12" stroke-linejoin="round" />
            <circle cx="256" cy="280" r="150" fill="#F7AE3E" />
            <g clip-path="url(#chispa-head)">
              <rect x="96" y="150" width="320" height="44" fill="#10A3A3" />
              <rect x="96" y="162" width="320" height="12" fill="#fff" opacity=".55" />
              <g fill="none" stroke="#8A4B12" stroke-width="8" stroke-linecap="round">
                <path d="M134 236a16 16 0 1 0 22-14" />
                <path d="M378 236a16 16 0 1 1-22-14" />
                <path d="M150 322a14 14 0 1 0 20-10" />
                <path d="M362 322a14 14 0 1 1-20-10" />
                <path d="M242 214a14 14 0 0 1 28 0" />
              </g>
              <g fill="#C97A1E">
                <circle cx="148" cy="240" r="6" /><circle cx="364" cy="240" r="6" />
                <circle cx="162" cy="324" r="5" /><circle cx="350" cy="324" r="5" />
              </g>
            </g>
            <ellipse cx="256" cy="344" rx="82" ry="58" fill="#FFF4E0" />
            <circle cx="186" cy="320" r="18" fill="#FF8A80" opacity="0.3" />
            <circle cx="326" cy="320" r="18" fill="#FF8A80" opacity="0.3" />
            <g class="c-eyes">
              <circle cx="200" cy="262" r="34" fill="#fff" />
              <circle cx="312" cy="262" r="34" fill="#fff" />
              <circle cx="206" cy="266" r="20" fill="#1B1F3B" />
              <circle cx="306" cy="266" r="20" fill="#1B1F3B" />
              <circle cx="212" cy="258" r="7" fill="#fff" />
              <circle cx="312" cy="258" r="7" fill="#fff" />
            </g>
            <path d="M230 308h52l-26 26Z" fill="#3B2314" stroke="#3B2314" stroke-width="10" stroke-linejoin="round" />
            <ellipse class="c-mouth" cx="256" cy="362" rx="20" ry="14" fill="#7A2E1C" />
            <path d="M256 334v12M226 356c10 10 20 10 30 0 10 10 20 10 30 0" fill="none" stroke="#3B2314" stroke-width="8" stroke-linecap="round" />
            <g fill="#C9A27A"><circle cx="214" cy="338" r="4.5" /><circle cx="200" cy="354" r="4.5" /><circle cx="298" cy="338" r="4.5" /><circle cx="312" cy="354" r="4.5" /></g>
          </g>
        </g>
      </svg>
    </div>
  );
}
