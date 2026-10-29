const STORY_ICONS = new Set([
  "pigs",
  "goldilocks",
  "tortoise",
  "hen",
  "gingerbread",
  "goats",
  "duckling",
  "jack",
]);

function Badge({ mark }) {
  return (
    <>
      <circle cx="24" cy="24" r="17" fill="currentColor" opacity="0.22" />
      <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="4" />
      <text
        x="24"
        y="25"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="22"
        fontWeight="800"
        fill="currentColor"
        fontFamily="Trebuchet MS, Comic Sans MS, sans-serif"
      >
        {mark}
      </text>
    </>
  );
}

const SHAPES = {
  speaker: (
    <>
      <path d="M6 18 H14 L26 8 V40 L14 30 H6 Z" fill="currentColor" />
      <path d="M32 16 a9 9 0 0 1 0 16" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M37 11 a15 15 0 0 1 0 26" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  back: <path d="M30 8 L12 24 L30 40 V31 H42 V17 H30 Z" fill="currentColor" />,
  next: <path d="M18 8 L36 24 L18 40 V31 H6 V17 H18 Z" fill="currentColor" />,
  home: (
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M4 22 L24 6 L44 22 V26 H38 V44 H10 V26 H4 Z M20 30 H28 V44 H20 Z"
    />
  ),
  check: (
    <path
      d="M10 25 L20 36 L40 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  ),
  clear: (
    <>
      <circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" strokeWidth="5" />
      <path d="M16 16 L32 32 M32 16 L16 32" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  add: (
    <>
      <circle cx="24" cy="24" r="16" fill="none" stroke="currentColor" strokeWidth="4" />
      <path d="M24 14 V34 M14 24 H34" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
    </>
  ),
  cards: (
    <>
      <rect x="16" y="4" width="26" height="32" rx="4" fill="none" stroke="currentColor" strokeWidth="4" />
      <rect x="6" y="12" width="28" height="32" rx="4" fill="currentColor" />
      <path d="M12 24 H28 M12 30 H24 M12 36 H18" stroke="#1e88e5" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
  sentence: (
    <>
      <rect x="3" y="16" width="9" height="16" rx="3" fill="currentColor" />
      <rect x="15" y="16" width="16" height="16" rx="3" fill="currentColor" />
      <rect x="34" y="16" width="11" height="16" rx="3" fill="currentColor" />
    </>
  ),
  book: (
    <path
      fill="currentColor"
      d="M6 12 H21 C23 12 24 14 24 16 V40 C22 36 19 34 15 34 H6 Z M42 12 H27 C25 12 24 14 24 16 V40 C26 36 29 34 33 34 H42 Z"
    />
  ),
  questions: (
    <>
      <circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" strokeWidth="4" />
      <path
        d="M18 18 c0-5 12-7 12 0 c0 6-6 5-6 11"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <circle cx="24" cy="36" r="2.6" fill="currentColor" />
    </>
  ),
  shuffle: (
    <>
      <rect x="6" y="16" width="26" height="26" rx="4" fill="currentColor" />
      <circle cx="34" cy="16" r="11" fill="currentColor" />
      <path d="M34 9 V23 M27 16 H41" stroke="#1565c0" strokeWidth="3.5" strokeLinecap="round" />
    </>
  ),
  abc: (
    <>
      <rect x="2" y="10" width="44" height="28" rx="8" fill="#fff" />
      <text
        x="24"
        y="25"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="16"
        fontWeight="800"
        fontFamily="Trebuchet MS, Comic Sans MS, sans-serif"
      >
        <tspan fill="#e53935">A</tspan>
        <tspan fill="#1e88e5">B</tspan>
        <tspan fill="#43a047">C</tspan>
      </text>
    </>
  ),
  together: (
    <>
      <circle cx="12" cy="16" r="5" fill="currentColor" />
      <circle cx="24" cy="13" r="6" fill="currentColor" />
      <circle cx="36" cy="16" r="5" fill="currentColor" />
      <path d="M4 40 Q12 26 20 40" fill="currentColor" />
      <path d="M14 42 Q24 24 34 42" fill="currentColor" />
      <path d="M28 40 Q36 26 44 40" fill="currentColor" />
    </>
  ),
  choose: <path d="M6 19 H24 V11 L42 24 L24 37 V29 H6 Z" fill="currentColor" />,
  pigs: (
    <>
      <circle cx="24" cy="26" r="14" fill="#f48fb1" />
      <ellipse cx="12" cy="16" rx="5" ry="6" fill="#f48fb1" />
      <ellipse cx="36" cy="16" rx="5" ry="6" fill="#f48fb1" />
      <ellipse cx="24" cy="30" rx="7" ry="5" fill="#f06292" />
      <circle cx="21.5" cy="29.5" r="1.2" fill="#ad1457" />
      <circle cx="26.5" cy="29.5" r="1.2" fill="#ad1457" />
      <circle cx="18" cy="23" r="1.5" fill="#263238" />
      <circle cx="30" cy="23" r="1.5" fill="#263238" />
    </>
  ),
  goldilocks: (
    <>
      <circle cx="24" cy="18" r="8" fill="#ffe082" />
      <path d="M14 18 Q24 4 34 18 Q30 12 24 12 Q18 12 14 18" fill="#ffb300" />
      <path d="M14 28 Q24 22 34 28 L36 42 H12 Z" fill="#42a5f5" />
      <circle cx="21" cy="18" r="1.2" fill="#263238" />
      <circle cx="27" cy="18" r="1.2" fill="#263238" />
    </>
  ),
  tortoise: (
    <>
      <ellipse cx="22" cy="30" rx="14" ry="9" fill="#66bb6a" />
      <ellipse cx="22" cy="28" rx="9" ry="6" fill="#2e7d32" />
      <circle cx="36" cy="26" r="5" fill="#a5d6a7" />
      <circle cx="38" cy="25" r="1.1" fill="#263238" />
    </>
  ),
  hen: (
    <>
      <ellipse cx="20" cy="30" rx="12" ry="9" fill="#ef5350" />
      <circle cx="32" cy="22" r="7" fill="#ef5350" />
      <path d="M30 14 L34 6 L37 15" fill="#ffca28" />
      <path d="M38 22 L46 23 L38 26" fill="#ff8f00" />
      <circle cx="34" cy="21" r="1.2" fill="#263238" />
    </>
  ),
  gingerbread: (
    <>
      <circle cx="24" cy="12" r="7" fill="#a1887f" />
      <path d="M10 22 H38" stroke="#a1887f" strokeWidth="6" strokeLinecap="round" />
      <rect x="16" y="18" width="16" height="16" rx="6" fill="#a1887f" />
      <path d="M18 40 L22 32 M30 40 L26 32" stroke="#a1887f" strokeWidth="5" strokeLinecap="round" />
      <circle cx="21" cy="12" r="1.1" fill="#263238" />
      <circle cx="27" cy="12" r="1.1" fill="#263238" />
      <circle cx="24" cy="26" r="2" fill="#e53935" />
    </>
  ),
  goats: (
    <>
      <ellipse cx="20" cy="31" rx="12" ry="8" fill="#efebe9" stroke="#6d4c41" strokeWidth="2" />
      <circle cx="32" cy="23" r="7" fill="#efebe9" stroke="#6d4c41" strokeWidth="2" />
      <path d="M28 17 L26 6" stroke="#5d4037" strokeWidth="3" strokeLinecap="round" />
      <path d="M35 16 L39 5" stroke="#5d4037" strokeWidth="3" strokeLinecap="round" />
      <circle cx="34" cy="22" r="1.2" fill="#263238" />
    </>
  ),
  duckling: (
    <>
      <ellipse cx="20" cy="30" rx="12" ry="8" fill="#ffee58" />
      <circle cx="32" cy="24" r="7" fill="#ffee58" />
      <path d="M38 23 L47 26 L38 29 Z" fill="#ff8f00" />
      <circle cx="34" cy="22" r="1.2" fill="#263238" />
    </>
  ),
  jack: (
    <>
      <path d="M12 42 C16 30 22 24 30 10" fill="none" stroke="#43a047" strokeWidth="4" strokeLinecap="round" />
      <circle cx="18" cy="20" r="3" fill="#66bb6a" />
      <circle cx="34" cy="16" r="6" fill="#ffcc80" />
      <rect x="29" y="22" width="10" height="12" rx="3" fill="#1e88e5" />
      <circle cx="32" cy="15" r="1" fill="#263238" />
      <circle cx="36" cy="15" r="1" fill="#263238" />
    </>
  ),
};

export function Icon({ name }) {
  const body = name?.startsWith("badge-") ? (
    <Badge mark={name.slice("badge-".length)} />
  ) : (
    SHAPES[name] ?? SHAPES.book
  );
  return (
    <svg className="icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      {body}
    </svg>
  );
}

export function ButtonFace({ icon, children }) {
  const picture = STORY_ICONS.has(icon) ? (
    <span className="icon-badge">
      <Icon name={icon} />
    </span>
  ) : (
    <Icon name={icon} />
  );
  return (
    <>
      {picture}
      <span className="btn-text">{children}</span>
    </>
  );
}
